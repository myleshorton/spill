import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../../models/video_meta.dart';

/// HTTP client wrapping the archiver API.
/// Expanded to match the P2pService interface for the web UI.
class ArchiveApi extends ChangeNotifier {
  final String baseUrl;
  final http.Client _client = http.Client();

  List<VideoMeta> _videos = [];
  List<VideoMeta> _myVideos = [];
  bool _loading = false;
  String _query = '';
  bool _connected = false;
  String? _nodeId;
  String? _error;
  double _publishProgress = 0.0;
  String _publishStage = '';

  ArchiveApi({this.baseUrl = ''});

  List<VideoMeta> get videos => _videos;
  List<VideoMeta> get myVideos => _myVideos;
  bool get loading => _loading;
  String get query => _query;
  bool get connected => _connected;
  String? get nodeId => _nodeId;
  String? get error => _error;
  double get publishProgress => _publishProgress;
  String get publishStage => _publishStage;

  /// Fetch all videos from the archiver.
  Future<void> fetchVideos({int limit = 50, int offset = 0, String? category}) async {
    _loading = true;
    _query = '';
    notifyListeners();

    try {
      var url = '$baseUrl/api/videos?limit=$limit&offset=$offset';
      if (category != null) url += '&category=${Uri.encodeComponent(category)}';
      final response = await _client.get(
        Uri.parse(url),
      );
      if (response.statusCode == 200) {
        final List<dynamic> data = json.decode(response.body);
        _videos = data.map((j) => VideoMeta.fromJson(j as Map<String, dynamic>)).toList();
      }
    } catch (e) {
      debugPrint('ArchiveApi.fetchVideos error: $e');
    }

    _loading = false;
    notifyListeners();
  }

  /// Alias for fetchVideos.
  Future<void> refreshVideos() => fetchVideos();

  /// Full-text search.
  Future<void> search(String q) async {
    _query = q;
    if (q.trim().isEmpty) {
      return fetchVideos();
    }

    _loading = true;
    notifyListeners();

    try {
      final response = await _client.get(
        Uri.parse('$baseUrl/api/videos/search?q=${Uri.encodeComponent(q)}'),
      );
      if (response.statusCode == 200) {
        final List<dynamic> data = json.decode(response.body);
        _videos = data.map((j) => VideoMeta.fromJson(j as Map<String, dynamic>)).toList();
      }
    } catch (e) {
      debugPrint('ArchiveApi.search error: $e');
    }

    _loading = false;
    notifyListeners();
  }

  /// Fetch locally-published videos.
  Future<void> fetchMyVideos({int limit = 50, int offset = 0}) async {
    try {
      final response = await _client.get(
        Uri.parse('$baseUrl/api/my-videos?limit=$limit&offset=$offset'),
      );
      if (response.statusCode == 200) {
        final List<dynamic> data = json.decode(response.body);
        _myVideos = data.map((j) => VideoMeta.fromJson(j as Map<String, dynamic>)).toList();
        notifyListeners();
      }
    } catch (e) {
      debugPrint('ArchiveApi.fetchMyVideos error: $e');
    }
  }

  /// Alias for fetchMyVideos.
  Future<void> refreshMyVideos() => fetchMyVideos();

  /// Fetch a page of recent videos (paginated via limit/offset).
  /// Returns { 'videos': List<VideoMeta>, 'hasMore': bool, 'nextOffset': int }.
  Future<Map<String, dynamic>> fetchRecentVideos({int limit = 20, int offset = 0, String? category}) async {
    try {
      var url = '$baseUrl/api/videos?limit=$limit&offset=$offset';
      if (category != null) url += '&category=${Uri.encodeComponent(category)}';
      final response = await _client.get(
        Uri.parse(url),
      );
      if (response.statusCode == 200) {
        final List<dynamic> data = json.decode(response.body);
        final videos = data
            .map((j) => VideoMeta.fromJson(j as Map<String, dynamic>))
            .toList();
        return {
          'videos': videos,
          'hasMore': videos.length >= limit,
          'nextOffset': offset + videos.length,
        };
      }
    } catch (e) {
      debugPrint('ArchiveApi.fetchRecentVideos error: $e');
    }
    return {'videos': <VideoMeta>[], 'hasMore': false, 'nextOffset': 0};
  }

  /// Fetch stats (connected, nodeId, counts).
  Future<void> fetchStats() async {
    try {
      final response = await _client.get(
        Uri.parse('$baseUrl/api/stats'),
      );
      if (response.statusCode == 200) {
        final data = json.decode(response.body) as Map<String, dynamic>;
        _connected = data['connected'] as bool? ?? false;
        _nodeId = data['nodeId'] as String?;
        _error = null;
        notifyListeners();
      }
    } catch (e) {
      _connected = false;
      _error = e.toString();
      debugPrint('ArchiveApi.fetchStats error: $e');
      notifyListeners();
    }
  }

  /// Publish a video via multipart POST.
  Future<void> publishVideo({
    required Uint8List videoBytes,
    required String filename,
    required String title,
    String? description,
    Uint8List? thumbBytes,
    required String category,
    String? contentType,
  }) async {
    _publishProgress = 0.0;
    _publishStage = 'Uploading...';
    notifyListeners();

    try {
      final request = http.MultipartRequest(
        'POST',
        Uri.parse('$baseUrl/api/videos'),
      );
      request.files.add(http.MultipartFile.fromBytes(
        'video',
        videoBytes,
        filename: filename,
      ));
      if (thumbBytes != null) {
        request.files.add(http.MultipartFile.fromBytes(
          'thumbnail',
          thumbBytes,
          filename: 'thumb.jpg',
        ));
      }
      request.fields['title'] = title;
      request.fields['category'] = category;
      if (description != null && description.isNotEmpty) {
        request.fields['description'] = description;
      }
      if (contentType != null) {
        request.fields['contentType'] = contentType;
      }
      request.fields['fileName'] = filename;

      _publishProgress = 0.3;
      _publishStage = 'Uploading...';
      notifyListeners();

      final streamedResponse = await request.send();
      final response = await http.Response.fromStream(streamedResponse);

      if (response.statusCode == 201) {
        _publishProgress = 1.0;
        _publishStage = 'Complete';
        notifyListeners();

        // Refresh both lists
        await fetchVideos();
        await fetchMyVideos();
      } else {
        final body = json.decode(response.body);
        throw Exception(body['error'] ?? 'Upload failed');
      }
    } catch (e) {
      _publishProgress = 0.0;
      _publishStage = '';
      _error = e.toString();
      notifyListeners();
      rethrow;
    }
  }

  /// Delete a video by ID.
  Future<void> deleteVideo(String id) async {
    try {
      final response = await _client.delete(
        Uri.parse('$baseUrl/api/videos/$id'),
      );
      if (response.statusCode == 200) {
        _videos.removeWhere((v) => v.id == id);
        _myVideos.removeWhere((v) => v.id == id);
        notifyListeners();
      } else {
        final body = json.decode(response.body);
        throw Exception(body['error'] ?? 'Delete failed');
      }
    } catch (e) {
      debugPrint('ArchiveApi.deleteVideo error: $e');
      rethrow;
    }
  }

  /// URL for streaming a video.
  String videoStreamUrl(String id) => '$baseUrl/api/stream/$id';

  /// URL for a thumbnail image.
  String thumbUrl(String id) => '$baseUrl/api/thumb/$id';

  @override
  void dispose() {
    _client.close();
    super.dispose();
  }
}
