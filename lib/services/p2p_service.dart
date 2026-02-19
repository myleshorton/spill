import 'dart:async';

import 'package:flutter/foundation.dart';

import '../models/video_meta.dart';
import 'bare_bridge.dart';
import 'rpc_client.dart';
import 'video_stream_server.dart';

/// High-level P2P service that wraps the RPC client.
///
/// Provides a clean API for the UI layer: start/stop the node,
/// publish videos, fetch videos, and listen for new discoveries.
class P2pService extends ChangeNotifier {
  final BareBridge _bridge;
  late final RpcClient _rpc;

  List<VideoMeta> videos = [];
  List<VideoMeta> myVideos = [];
  List<VideoMeta> searchResults = [];
  bool searching = false;
  String? nodeId;
  String? username;
  bool connected = false;
  bool loading = false;
  String? error;
  double publishProgress = 0.0;
  String publishStage = '';
  VideoStreamServer? _streamServer;
  StreamSubscription? _notificationSub;
  StreamSubscription? _progressSub;
  StreamSubscription? _deletionSub;
  StreamSubscription? _searchSub;

  P2pService(this._bridge) {
    _rpc = RpcClient(_bridge);
  }

  /// Start the P2P node and begin discovering videos.
  Future<void> startNode(String dataDir) async {
    loading = true;
    error = null;
    notifyListeners();

    try {
      final result = await _rpc.call('startNode', {'dataDir': dataDir});
      nodeId = result as String?;
      connected = true;

      // Start the localhost stream server for range-based video playback
      _streamServer = VideoStreamServer(_rpc);
      await _streamServer!.start();

      // Listen for new video discoveries from peers
      _notificationSub = _rpc.notifications('onVideoDiscovered').listen((msg) {
        final params = msg['params'] as Map<String, dynamic>;
        videos.insert(0, VideoMeta.fromJson(params));
        notifyListeners();
      });

      // Listen for video deletion notifications from peers
      _deletionSub = _rpc.notifications('onVideoDeleted').listen((msg) {
        final params = msg['params'] as Map<String, dynamic>;
        final id = params['id'] as String;
        videos.removeWhere((v) => v.id == id);
        myVideos.removeWhere((v) => v.id == id);
        notifyListeners();
      });

      // Listen for streaming search results from network peers
      _searchSub = _rpc.notifications('onSearchResults').listen((msg) {
        final params = msg['params'] as Map<String, dynamic>;
        final results = params['results'] as List?;
        if (results != null && searching) {
          for (final r in results) {
            final meta = VideoMeta.fromJson(r as Map<String, dynamic>);
            if (!searchResults.any((v) => v.id == meta.id)) {
              searchResults.add(meta);
            }
          }
          notifyListeners();
        }
      });

      // Listen for publish progress updates
      _progressSub = _rpc.notifications('onPublishProgress').listen((msg) {
        final params = msg['params'] as Map<String, dynamic>;
        publishProgress = (params['progress'] as num).toDouble();
        publishStage = params['stage'] as String;
        notifyListeners();
      });

      // Load saved profile (username)
      await getProfile();

      // Fetch initial video list
      await refreshVideos();
      await refreshMyVideos();
    } catch (e) {
      error = e.toString();
      connected = false;
    }

    loading = false;
    notifyListeners();
  }

  /// Refresh the video list from the backend.
  Future<void> refreshVideos({String? category}) async {
    try {
      final result = await _rpc.call('getVideos', {
        if (category != null) 'category': category,
      });
      if (result is List) {
        videos = result
            .map((v) => VideoMeta.fromJson(v as Map<String, dynamic>))
            .toList();
        notifyListeners();
      }
    } catch (e) {
      error = e.toString();
      notifyListeners();
    }
  }

  /// Fetch a page of recent videos from the Hyperbee index.
  /// Returns { 'videos': List<VideoMeta>, 'cursor': String? }.
  Future<Map<String, dynamic>> getRecentVideos({int limit = 20, String? cursor, String? category}) async {
    final result = await _rpc.call('getRecentVideos', {
      'limit': limit,
      if (cursor != null) 'cursor': cursor,
      if (category != null) 'category': category,
    });
    final map = result as Map<String, dynamic>;
    return {
      'videos': (map['videos'] as List)
          .map((v) => VideoMeta.fromJson(v as Map<String, dynamic>))
          .toList(),
      'cursor': map['cursor'] as String?,
    };
  }

  /// Fetch a page of popular videos sorted by peer count.
  /// Returns { 'videos': List<VideoMeta>, 'hasMore': bool }.
  Future<Map<String, dynamic>> getPopularVideos({int limit = 20, int offset = 0, String? category}) async {
    final result = await _rpc.call('getPopularVideos', {
      'limit': limit,
      'offset': offset,
      if (category != null) 'category': category,
    });
    final map = result as Map<String, dynamic>;
    return {
      'videos': (map['videos'] as List)
          .map((v) => VideoMeta.fromJson(v as Map<String, dynamic>))
          .toList(),
      'hasMore': map['hasMore'] as bool,
    };
  }

  /// Refresh the user's own published videos from the backend.
  Future<void> refreshMyVideos() async {
    try {
      final result = await _rpc.call('getMyVideos');
      if (result is List) {
        myVideos = result
            .map((v) => VideoMeta.fromJson(v as Map<String, dynamic>))
            .toList();
        notifyListeners();
      }
    } catch (e) {
      error = e.toString();
      notifyListeners();
    }
  }

  /// Publish a video to the P2P network.
  Future<VideoMeta> publishVideo({
    required String videoPath,
    required String title,
    String? description,
    String? thumbnailPath,
    required String category,
    String? contentType,
    String? fileName,
  }) async {
    publishProgress = 0.0;
    publishStage = '';
    notifyListeners();

    final result = await _rpc.call('publishVideo', {
      'videoPath': videoPath,
      'title': title,
      'description': description ?? '',
      'thumbnailPath': thumbnailPath,
      'category': category,
      if (contentType != null) 'contentType': contentType,
      if (fileName != null) 'fileName': fileName,
    }, const Duration(minutes: 5));
    final meta = VideoMeta.fromJson(result as Map<String, dynamic>);

    publishProgress = 1.0;
    publishStage = 'Complete';
    // Only insert if not already added by the onVideoDiscovered notification
    if (!videos.any((v) => v.id == meta.id)) {
      videos.insert(0, meta);
    }
    if (!myVideos.any((v) => v.id == meta.id)) {
      myVideos.insert(0, meta);
    }
    notifyListeners();
    return meta;
  }

  /// Fetch a video from a remote peer and save to local storage.
  Future<String> fetchVideo(String driveKey, String videoKey, String destPath) async {
    final result = await _rpc.call('fetchVideo', {
      'driveKey': driveKey,
      'videoKey': videoKey,
      'destPath': destPath,
    });
    return result as String;
  }

  /// Fetch a thumbnail from a remote peer and save to local storage.
  Future<String> fetchThumbnail(String driveKey, String thumbKey, String destPath) async {
    final result = await _rpc.call('fetchVideo', {
      'driveKey': driveKey,
      'videoKey': thumbKey,
      'destPath': destPath,
    });
    return result as String;
  }

  /// Get a localhost streaming URL for range-based video playback.
  String? getStreamUrl(String driveKey, String videoKey) {
    return _streamServer?.getStreamUrl(driveKey, videoKey);
  }

  /// Delete a published video from the P2P network.
  /// Removes from Hyperdrive and catalog; does NOT delete the original file.
  Future<void> deleteVideo(String videoId) async {
    await _rpc.call('deleteVideo', {'id': videoId});
    videos.removeWhere((v) => v.id == videoId);
    myVideos.removeWhere((v) => v.id == videoId);
    notifyListeners();
  }

  /// Get the node's public key identity.
  Future<String?> getNodeId() async {
    try {
      final result = await _rpc.call('getNodeId');
      return result as String?;
    } catch (_) {
      return null;
    }
  }

  /// Get the user's profile (identity public key and username).
  Future<void> getProfile() async {
    try {
      final result = await _rpc.call('getProfile');
      if (result is Map<String, dynamic>) {
        username = result['username'] as String?;
        notifyListeners();
      }
    } catch (_) {}
  }

  /// Check if a username is available on the DHT.
  Future<Map<String, dynamic>> checkUsername(String name) async {
    final result = await _rpc.call('checkUsername', {'username': name});
    return result as Map<String, dynamic>;
  }

  /// Claim a username on the DHT.
  Future<void> setUsername(String newUsername) async {
    await _rpc.call('setUsername', {'username': newUsername},
        const Duration(seconds: 30));
    username = newUsername;
    notifyListeners();
  }

  /// Search for content across the P2P network.
  Future<List<VideoMeta>> searchContent(String query) async {
    searching = true;
    searchResults = [];
    notifyListeners();

    try {
      final result = await _rpc.call(
        'searchContent',
        {'query': query},
        const Duration(seconds: 12),
      );
      if (result is Map<String, dynamic>) {
        final results = result['results'] as List?;
        if (results != null) {
          for (final r in results) {
            final meta = VideoMeta.fromJson(r as Map<String, dynamic>);
            if (!searchResults.any((v) => v.id == meta.id)) {
              searchResults.add(meta);
            }
          }
        }
      }
    } catch (e) {
      error = e.toString();
    }

    searching = false;
    notifyListeners();
    return searchResults;
  }

  /// Clear search results and return to browse mode.
  void clearSearch() {
    searchResults = [];
    searching = false;
    notifyListeners();
  }

  /// Send a ping to verify the backend is alive.
  Future<String> ping() async {
    final result = await _rpc.call('ping');
    return result as String;
  }

  @override
  void dispose() {
    _streamServer?.stop();
    _notificationSub?.cancel();
    _progressSub?.cancel();
    _deletionSub?.cancel();
    _searchSub?.cancel();
    _rpc.dispose();
    _bridge.dispose();
    super.dispose();
  }
}
