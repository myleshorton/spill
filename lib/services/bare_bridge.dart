import 'dart:async';
import 'dart:convert';
import 'dart:ffi';
import 'dart:isolate';

import 'package:ffi/ffi.dart';

/// FFI function typedefs for the C bridge
typedef _InitDartApiC = Int32 Function(Pointer<Void>);
typedef _InitDartApiDart = int Function(Pointer<Void>);

typedef _InitC = Int32 Function(Pointer<Utf8>, Pointer<Utf8>);
typedef _InitDart = int Function(Pointer<Utf8>, Pointer<Utf8>);

typedef _ShutdownC = Void Function();
typedef _ShutdownDart = void Function();

typedef _SendC = Int32 Function(Pointer<Utf8>, Int32);
typedef _SendDart = int Function(Pointer<Utf8>, int);

typedef _SetDartPortC = Void Function(Int64);
typedef _SetDartPortDart = void Function(int);

/// Low-level FFI bridge to the native C library.
///
/// Manages the Bare runtime worklet lifecycle and provides IPC
/// communication with the JS P2P backend.
class BareBridge {
  DynamicLibrary? _lib;
  ReceivePort? _receivePort;
  final StreamController<Map<String, dynamic>> _messageController =
      StreamController.broadcast();
  bool _initialized = false;

  late _InitDartApiDart _initDartApi;
  late _InitDart _init;
  late _ShutdownDart _shutdown;
  late _SendDart _send;
  late _SetDartPortDart _setDartPort;

  /// Stream of JSON messages received from the JS worklet.
  Stream<Map<String, dynamic>> get messages => _messageController.stream;

  /// Whether the bridge has been initialized.
  bool get isInitialized => _initialized;

  /// Initialize the bridge: load the native library, set up Dart API,
  /// create a receive port for async messages, and start the worklet.
  Future<void> init(String dataDir, String bundlePath) async {
    if (_initialized) return;

    // Load the native library.
    // On macOS/iOS the C code is compiled into the Runner executable,
    // so we use DynamicLibrary.process() to find symbols in the current process.
    // On other platforms, load the shared library by name.
    _lib = DynamicLibrary.process();

    // Look up C functions
    _initDartApi = _lib!
        .lookupFunction<_InitDartApiC, _InitDartApiDart>('samizdat_init_dart_api');
    _init = _lib!.lookupFunction<_InitC, _InitDart>('samizdat_init');
    _shutdown = _lib!.lookupFunction<_ShutdownC, _ShutdownDart>('samizdat_shutdown');
    _send = _lib!.lookupFunction<_SendC, _SendDart>('samizdat_send');
    _setDartPort =
        _lib!.lookupFunction<_SetDartPortC, _SetDartPortDart>('samizdat_set_dart_port');

    // Initialize the Dart native API
    final initResult = _initDartApi(NativeApi.initializeApiDLData);
    if (initResult != 0) {
      throw Exception('Failed to initialize Dart API (code: $initResult)');
    }

    // Create a receive port to get async messages from C
    _receivePort = ReceivePort();
    _receivePort!.listen((message) {
      if (message is String) {
        // IPC may deliver multiple JSON objects concatenated in one buffer.
        // Parse them individually by scanning for top-level JSON boundaries.
        _parseJsonMessages(message);
      }
    });

    // Register the port with the C bridge
    _setDartPort(_receivePort!.sendPort.nativePort);

    // Start the Bare runtime with the JS bundle
    final dataDirPtr = dataDir.toNativeUtf8();
    final bundlePathPtr = bundlePath.toNativeUtf8();
    try {
      final result = _init(dataDirPtr, bundlePathPtr);
      if (result != 0) {
        throw Exception('Failed to initialize Bare runtime (code: $result)');
      }
    } finally {
      calloc.free(dataDirPtr);
      calloc.free(bundlePathPtr);
    }

    _initialized = true;
  }

  /// Parse potentially concatenated JSON messages from an IPC buffer.
  ///
  /// The IPC pipe may deliver multiple JSON objects in a single read,
  /// e.g. `{"a":1}{"b":2}`. We scan for matching braces to split them.
  void _parseJsonMessages(String data) {
    int i = 0;
    while (i < data.length) {
      // Skip whitespace between messages
      while (i < data.length && (data[i] == ' ' || data[i] == '\n' || data[i] == '\r' || data[i] == '\t')) {
        i++;
      }
      if (i >= data.length) break;

      if (data[i] != '{') {
        // Not a JSON object start — skip to find one
        final next = data.indexOf('{', i);
        if (next == -1) break;
        i = next;
      }

      // Find the matching closing brace
      int depth = 0;
      int start = i;
      bool inString = false;
      bool escaped = false;
      for (int j = i; j < data.length; j++) {
        final c = data[j];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (c == '\\' && inString) {
          escaped = true;
          continue;
        }
        if (c == '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;
        if (c == '{') depth++;
        if (c == '}') {
          depth--;
          if (depth == 0) {
            final jsonStr = data.substring(start, j + 1);
            try {
              final json = jsonDecode(jsonStr) as Map<String, dynamic>;
              _messageController.add(json);
            } catch (e) {
              print('spill_bridge: parse error: $e for: $jsonStr');
            }
            i = j + 1;
            break;
          }
        }
      }
      // If we never found a matching brace, stop
      if (depth != 0) {
        print('spill_bridge: incomplete JSON at end of buffer');
        break;
      }
    }
  }

  /// Send a JSON message to the JS worklet.
  void send(Map<String, dynamic> message) {
    if (!_initialized) {
      throw StateError('Bridge not initialized');
    }

    final jsonStr = jsonEncode(message);
    final ptr = jsonStr.toNativeUtf8();
    try {
      _send(ptr, jsonStr.length);
    } finally {
      calloc.free(ptr);
    }
  }

  /// Shut down the bridge and clean up resources.
  void dispose() {
    if (_initialized) {
      _shutdown();
    }
    _receivePort?.close();
    _messageController.close();
    _initialized = false;
  }
}
