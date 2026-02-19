import 'package:flutter_test/flutter_test.dart';
import 'package:samizdat/models/video_meta.dart';

void main() {
  test('VideoMeta.fromJson parses correctly', () {
    final json = {
      'id': 'abc123',
      'title': 'Test Video',
      'description': 'A test',
      'driveKey': 'deadbeef01234567',
      'videoKey': '/videos/test.mp4',
      'thumbKey': null,
      'timestamp': 1700000000000,
      'peerCount': 5,
    };

    final meta = VideoMeta.fromJson(json);

    expect(meta.id, 'abc123');
    expect(meta.title, 'Test Video');
    expect(meta.peerCount, 5);
    expect(meta.truncatedDriveKey, 'deadbe...234567');
  });
}
