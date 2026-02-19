import 'dart:async';

import 'bare_bridge.dart';

/// JSON-RPC 2.0 client that communicates with the Bare JS worklet.
///
/// Sends requests over the FFI bridge and matches responses by ID.
/// Also provides a stream of notifications (messages without an ID).
class RpcClient {
  final BareBridge _bridge;
  int _nextId = 1;
  final Map<int, Completer<dynamic>> _pending = {};
  final StreamController<Map<String, dynamic>> _notificationController =
      StreamController.broadcast();

  RpcClient(this._bridge) {
    _bridge.messages.listen(_handleMessage);
  }

  /// Send a JSON-RPC request and wait for the response.
  ///
  /// [timeout] defaults to 30 seconds. Use a longer value for calls that
  /// involve heavy I/O (e.g. publishing large video files).
  Future<dynamic> call(String method,
      [Map<String, dynamic>? params, Duration? timeout]) {
    final id = _nextId++;
    final completer = Completer<dynamic>();
    _pending[id] = completer;

    _bridge.send({
      'jsonrpc': '2.0',
      'method': method,
      'params': params ?? {},
      'id': id,
    });

    return completer.future.timeout(
      timeout ?? const Duration(seconds: 30),
      onTimeout: () {
        _pending.remove(id);
        throw TimeoutException('RPC call "$method" timed out');
      },
    );
  }

  /// Stream of notifications from the JS worklet (messages without an ID).
  Stream<Map<String, dynamic>> get allNotifications =>
      _notificationController.stream;

  /// Stream of notifications filtered by method name.
  Stream<Map<String, dynamic>> notifications(String method) {
    return _notificationController.stream
        .where((msg) => msg['method'] == method);
  }

  void _handleMessage(Map<String, dynamic> message) {
    // If the message has an 'id', it's a response to a pending request
    if (message.containsKey('id') && message['id'] != null) {
      final id = message['id'] as int;
      final completer = _pending.remove(id);
      if (completer != null) {
        if (message.containsKey('error')) {
          completer.completeError(
            RpcError.fromJson(message['error'] as Map<String, dynamic>),
          );
        } else {
          completer.complete(message['result']);
        }
      }
    } else {
      // It's a notification from the JS side
      _notificationController.add(message);
    }
  }

  void dispose() {
    _notificationController.close();
    // Complete any pending requests with errors
    for (final completer in _pending.values) {
      completer.completeError(StateError('RPC client disposed'));
    }
    _pending.clear();
  }
}

class RpcError implements Exception {
  final int code;
  final String message;

  const RpcError({required this.code, required this.message});

  factory RpcError.fromJson(Map<String, dynamic> json) {
    return RpcError(
      code: json['code'] as int,
      message: json['message'] as String,
    );
  }

  @override
  String toString() => 'RpcError($code): $message';
}
