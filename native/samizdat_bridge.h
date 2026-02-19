#ifndef SAMIZDAT_BRIDGE_H
#define SAMIZDAT_BRIDGE_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/// Initialize the Dart native API. Must be called before any other function.
/// @param data The NativeApi.initializeApiDLData pointer from Dart.
/// @return 0 on success, non-zero on failure.
int samizdat_init_dart_api(void *data);

/// Initialize the Bare runtime and start the JS worklet.
/// @param data_dir Path to the app's data directory for persistent storage.
/// @param bundle_path Path to the bundled JS file (bundle.js).
/// @return 0 on success, non-zero on failure.
int samizdat_init(const char *data_dir, const char *bundle_path);

/// Shut down the Bare runtime and clean up resources.
void samizdat_shutdown(void);

/// Send a JSON-RPC message to the JS worklet via IPC.
/// @param json_message UTF-8 encoded JSON string.
/// @param length Length of the message in bytes.
/// @return 0 on success, non-zero on failure.
int samizdat_send(const char *json_message, int length);

/// Register a Dart SendPort to receive messages from the JS worklet.
/// Messages are posted as CObject strings via Dart_PostCObject_DL.
/// @param port The Dart SendPort's native port ID.
void samizdat_set_dart_port(int64_t port);

#ifdef __cplusplus
}
#endif

#endif /* SAMIZDAT_BRIDGE_H */
