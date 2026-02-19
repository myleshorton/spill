#include "samizdat_bridge.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

// Dart FFI native API
#include "dart_api_dl.h"

// bare-kit headers
#include "worklet.h"
#include "ipc.h"

// --- State ---

static int64_t g_dart_port = 0;
static int g_initialized = 0;

static bare_worklet_t *g_worklet = NULL;
static bare_ipc_t *g_ipc = NULL;
static bare_ipc_poll_t *g_poll = NULL;

// Copies of init parameters (we need these to outlive the init call since
// the worklet thread may reference them)
static char *g_data_dir = NULL;
static char *g_bundle_source = NULL;
static size_t g_bundle_source_len = 0;

// --- Helpers ---

/// Post a string message to the Dart isolate via its native port.
static void post_to_dart(const char *message, size_t len) {
    if (g_dart_port == 0) return;

    // Dart_PostCObject_DL needs a null-terminated string.
    // The IPC data may not be null-terminated, so we copy it.
    char *copy = (char *)malloc(len + 1);
    if (!copy) return;
    memcpy(copy, message, len);
    copy[len] = '\0';

    Dart_CObject obj;
    obj.type = Dart_CObject_kString;
    obj.value.as_string = copy;
    Dart_PostCObject_DL(g_dart_port, &obj);

    free(copy);
}

/// Called by bare_ipc_poll when the IPC pipe has data to read.
/// Runs on the GCD dispatch queue (macOS) or equivalent platform thread.
static void on_ipc_readable(bare_ipc_poll_t *poll, int events) {
    if (!(events & bare_ipc_readable)) return;

    bare_ipc_t *ipc = bare_ipc_poll_get_ipc(poll);

    void *data = NULL;
    size_t len = 0;

    // Read all available messages
    while (1) {
        int err = bare_ipc_read(ipc, &data, &len);
        if (err == bare_ipc_would_block || len == 0) break;
        if (err == bare_ipc_error) {
            fprintf(stderr, "samizdat_bridge: IPC read error\n");
            break;
        }

        post_to_dart((const char *)data, len);
    }
}

/// Read the JS bundle file from disk into a malloc'd buffer.
/// Returns 0 on success, -1 on failure.
static int read_bundle_file(const char *path, char **out_buf, size_t *out_len) {
    FILE *f = fopen(path, "rb");
    if (!f) return -1;

    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);

    if (size <= 0) {
        fclose(f);
        return -1;
    }

    char *buf = (char *)malloc((size_t)size);
    if (!buf) {
        fclose(f);
        return -1;
    }

    size_t read = fread(buf, 1, (size_t)size, f);
    fclose(f);

    if (read != (size_t)size) {
        free(buf);
        return -1;
    }

    *out_buf = buf;
    *out_len = (size_t)size;
    return 0;
}

// --- Public API ---

int samizdat_init_dart_api(void *data) {
    return Dart_InitializeApiDL(data);
}

int samizdat_init(const char *data_dir, const char *bundle_path) {
    if (g_initialized) {
        fprintf(stderr, "samizdat_bridge: already initialized\n");
        return -1;
    }

    fprintf(stdout, "samizdat_bridge: init data_dir=%s bundle=%s\n",
            data_dir ? data_dir : "(null)",
            bundle_path ? bundle_path : "(null)");

    int err;

    // --- 1. Read the JS bundle from disk ---
    err = read_bundle_file(bundle_path, &g_bundle_source, &g_bundle_source_len);
    if (err != 0) {
        fprintf(stderr, "samizdat_bridge: failed to read bundle at %s\n",
                bundle_path ? bundle_path : "(null)");
        return -1;
    }

    // Keep a copy of data_dir for the assets path
    g_data_dir = strdup(data_dir ? data_dir : "/tmp/samizdat");

    // --- 2. Allocate and initialize the worklet ---
    err = bare_worklet_alloc(&g_worklet);
    if (err != 0) {
        fprintf(stderr, "samizdat_bridge: bare_worklet_alloc failed\n");
        return -1;
    }

    bare_worklet_options_t options;
    memset(&options, 0, sizeof(options));
    options.memory_limit = 0;  // Auto-detect based on device memory
    options.assets = g_data_dir;

    err = bare_worklet_init(g_worklet, &options);
    if (err != 0) {
        fprintf(stderr, "samizdat_bridge: bare_worklet_init failed\n");
        return -1;
    }

    // --- 3. Start the worklet thread with the JS bundle ---
    // bare_worklet_start spawns a thread, loads the JS, and blocks until ready.
    // We pass the source buffer so it doesn't need to read from the filesystem.
    uv_buf_t source = uv_buf_init(g_bundle_source, (unsigned int)g_bundle_source_len);

    err = bare_worklet_start(g_worklet, "/samizdat.bundle", &source, 0, NULL);
    if (err != 0) {
        fprintf(stderr, "samizdat_bridge: bare_worklet_start failed (%d)\n", err);
        bare_worklet_destroy(g_worklet);
        free(g_worklet);
        g_worklet = NULL;
        return -1;
    }

    fprintf(stdout, "samizdat_bridge: worklet started successfully\n");

    // --- 4. Set up IPC for bidirectional communication ---
    err = bare_ipc_alloc(&g_ipc);
    if (err != 0) {
        fprintf(stderr, "samizdat_bridge: bare_ipc_alloc failed\n");
        bare_worklet_terminate(g_worklet);
        bare_worklet_destroy(g_worklet);
        free(g_worklet);
        g_worklet = NULL;
        return -1;
    }

    err = bare_ipc_init(g_ipc, g_worklet);
    if (err != 0) {
        fprintf(stderr, "samizdat_bridge: bare_ipc_init failed\n");
        free(g_ipc);
        g_ipc = NULL;
        bare_worklet_terminate(g_worklet);
        bare_worklet_destroy(g_worklet);
        free(g_worklet);
        g_worklet = NULL;
        return -1;
    }

    fprintf(stdout, "samizdat_bridge: IPC initialized (in=%d, out=%d)\n",
            bare_ipc_get_incoming(g_ipc), bare_ipc_get_outgoing(g_ipc));

    // --- 5. Start polling for incoming IPC messages ---
    // On macOS this uses GCD dispatch sources for async I/O.
    err = bare_ipc_poll_alloc(&g_poll);
    if (err != 0) {
        fprintf(stderr, "samizdat_bridge: bare_ipc_poll_alloc failed\n");
        bare_ipc_destroy(g_ipc);
        free(g_ipc);
        g_ipc = NULL;
        bare_worklet_terminate(g_worklet);
        bare_worklet_destroy(g_worklet);
        free(g_worklet);
        g_worklet = NULL;
        return -1;
    }

    err = bare_ipc_poll_init(g_poll, g_ipc);
    if (err != 0) {
        fprintf(stderr, "samizdat_bridge: bare_ipc_poll_init failed\n");
        free(g_poll);
        g_poll = NULL;
        bare_ipc_destroy(g_ipc);
        free(g_ipc);
        g_ipc = NULL;
        bare_worklet_terminate(g_worklet);
        bare_worklet_destroy(g_worklet);
        free(g_worklet);
        g_worklet = NULL;
        return -1;
    }

    // Start listening for readable events — when JS writes to IPC, we
    // read the data and forward it to Dart via Dart_PostCObject_DL.
    err = bare_ipc_poll_start(g_poll, bare_ipc_readable, on_ipc_readable);
    if (err != 0) {
        fprintf(stderr, "samizdat_bridge: bare_ipc_poll_start failed\n");
        bare_ipc_poll_destroy(g_poll);
        free(g_poll);
        g_poll = NULL;
        bare_ipc_destroy(g_ipc);
        free(g_ipc);
        g_ipc = NULL;
        bare_worklet_terminate(g_worklet);
        bare_worklet_destroy(g_worklet);
        free(g_worklet);
        g_worklet = NULL;
        return -1;
    }

    fprintf(stdout, "samizdat_bridge: IPC polling started\n");

    g_initialized = 1;
    return 0;
}

void samizdat_shutdown(void) {
    if (!g_initialized) return;

    fprintf(stdout, "samizdat_bridge: shutdown\n");

    // Stop IPC polling
    if (g_poll) {
        bare_ipc_poll_stop(g_poll);
        bare_ipc_poll_destroy(g_poll);
        free(g_poll);
        g_poll = NULL;
    }

    // Destroy IPC
    if (g_ipc) {
        bare_ipc_destroy(g_ipc);
        free(g_ipc);
        g_ipc = NULL;
    }

    // Terminate the worklet
    if (g_worklet) {
        bare_worklet_terminate(g_worklet);
        bare_worklet_destroy(g_worklet);
        free(g_worklet);
        g_worklet = NULL;
    }

    // Free owned strings
    free(g_data_dir);
    g_data_dir = NULL;
    free(g_bundle_source);
    g_bundle_source = NULL;
    g_bundle_source_len = 0;

    g_initialized = 0;
    g_dart_port = 0;
}

int samizdat_send(const char *json_message, int length) {
    if (!g_initialized || !g_ipc) {
        fprintf(stderr, "samizdat_bridge: not initialized\n");
        return -1;
    }

    if (!json_message || length <= 0) {
        return -1;
    }

    // Write the JSON message to the IPC pipe.
    // The JS worklet's bare-ipc module will receive this as a 'data' event.
    int written = bare_ipc_write(g_ipc, json_message, (size_t)length);
    if (written < 0) {
        if (written == bare_ipc_would_block) {
            fprintf(stderr, "samizdat_bridge: IPC write would block\n");
        } else {
            fprintf(stderr, "samizdat_bridge: IPC write error\n");
        }
        return -1;
    }

    return 0;
}

void samizdat_set_dart_port(int64_t port) {
    g_dart_port = port;
    fprintf(stdout, "samizdat_bridge: dart port set to %lld\n", (long long)port);
}
