import 'dart:convert';
import 'dart:io';

import 'rpc_client.dart';

/// Lightweight localhost HTTP server that proxies byte-range requests
/// to the bare runtime via RPC, enabling block-level video streaming
/// from Hyperdrive without downloading the entire file first.
class VideoStreamServer {
  final RpcClient _rpc;
  HttpServer? _server;
  final Map<String, int> _sizeCache = {};

  VideoStreamServer(this._rpc);

  int get port => _server?.port ?? 0;

  /// Start listening on a random available port on localhost.
  Future<void> start() async {
    _server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    _server!.listen(_handleRequest);
  }

  /// Generate a stream URL for the given drive/path pair.
  String getStreamUrl(String driveKey, String videoKey) {
    final drive = Uri.encodeQueryComponent(driveKey);
    final path = Uri.encodeQueryComponent(videoKey);
    return 'http://127.0.0.1:$port/stream?drive=$drive&path=$path';
  }

  Future<void> _handleRequest(HttpRequest request) async {
    try {
      final driveKey = request.uri.queryParameters['drive'];
      final videoKey = request.uri.queryParameters['path'];

      if (driveKey == null || videoKey == null) {
        request.response.statusCode = HttpStatus.badRequest;
        request.response.write('Missing drive or path parameter');
        await request.response.close();
        return;
      }

      // Get total file size (cached per drive:path)
      final cacheKey = '$driveKey:$videoKey';
      int totalSize;
      if (_sizeCache.containsKey(cacheKey)) {
        totalSize = _sizeCache[cacheKey]!;
      } else {
        final entry = await _rpc.call('getVideoEntry', {
          'driveKey': driveKey,
          'videoKey': videoKey,
        }, const Duration(seconds: 30));

        if (entry == null) {
          request.response.statusCode = HttpStatus.notFound;
          request.response.write('Video not found');
          await request.response.close();
          return;
        }

        totalSize = (entry as Map<String, dynamic>)['totalSize'] as int;
        _sizeCache[cacheKey] = totalSize;
      }

      // Parse Range header
      final rangeHeader = request.headers.value('range');
      int start;
      int end;

      if (rangeHeader != null && rangeHeader.startsWith('bytes=')) {
        final rangeSpec = rangeHeader.substring(6);
        final parts = rangeSpec.split('-');
        start = int.parse(parts[0]);
        end = parts[1].isEmpty ? totalSize - 1 : int.parse(parts[1]);
        // Clamp end to file size
        if (end >= totalSize) end = totalSize - 1;
      } else {
        start = 0;
        end = totalSize - 1;
      }

      final contentLength = end - start + 1;

      // Fetch the byte range from bare runtime
      final base64Data = await _rpc.call('readVideoRange', {
        'driveKey': driveKey,
        'videoKey': videoKey,
        'start': start,
        'end': end,
      }, const Duration(seconds: 60)) as String;

      final bytes = base64Decode(base64Data);

      // Respond with 206 Partial Content (or 200 for full file)
      if (rangeHeader != null) {
        request.response.statusCode = HttpStatus.partialContent;
        request.response.headers.set('Content-Range', 'bytes $start-$end/$totalSize');
      } else {
        request.response.statusCode = HttpStatus.ok;
      }

      request.response.headers.set('Accept-Ranges', 'bytes');
      request.response.headers.set('Content-Length', contentLength);
      request.response.headers.set('Content-Type', 'video/mp4');
      request.response.add(bytes);
      await request.response.close();
    } catch (e) {
      try {
        request.response.statusCode = HttpStatus.internalServerError;
        request.response.write('Stream error: $e');
        await request.response.close();
      } catch (_) {
        // Response may already be closed
      }
    }
  }

  /// Stop the server and clear caches.
  Future<void> stop() async {
    _sizeCache.clear();
    await _server?.close(force: true);
    _server = null;
  }
}
