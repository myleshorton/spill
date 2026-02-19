class VideoMeta {
  final String id;
  final String title;
  final String description;
  final String driveKey;
  final String fileKey;
  final String? thumbKey;
  final int timestamp;
  final int peerCount;
  final String? publisherKey;
  final String? publisherName;
  final String? category;
  final String contentType;

  const VideoMeta({
    required this.id,
    required this.title,
    required this.description,
    required this.driveKey,
    required this.fileKey,
    this.thumbKey,
    required this.timestamp,
    this.peerCount = 0,
    this.publisherKey,
    this.publisherName,
    this.category,
    this.contentType = 'video',
  });

  /// Deprecated alias for [fileKey].
  String get videoKey => fileKey;

  bool get isVideo => contentType == 'video';
  bool get isAudio => contentType == 'audio';
  bool get isImage => contentType == 'image';
  bool get isDocument => contentType == 'document';

  factory VideoMeta.fromJson(Map<String, dynamic> json) {
    return VideoMeta(
      id: json['id'] as String,
      title: json['title'] as String,
      description: json['description'] as String? ?? '',
      driveKey: json['driveKey'] as String,
      fileKey: (json['fileKey'] ?? json['videoKey']) as String,
      thumbKey: json['thumbKey'] as String?,
      timestamp: json['timestamp'] as int,
      peerCount: json['peerCount'] as int? ?? 0,
      publisherKey: json['publisherKey'] as String?,
      publisherName: json['publisherName'] as String?,
      category: json['category'] as String?,
      contentType: json['contentType'] as String? ?? 'video',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'description': description,
      'driveKey': driveKey,
      'fileKey': fileKey,
      'videoKey': fileKey, // backward compat
      'thumbKey': thumbKey,
      'timestamp': timestamp,
      'peerCount': peerCount,
      'publisherKey': publisherKey,
      'publisherName': publisherName,
      'category': category,
      'contentType': contentType,
    };
  }

  String get formattedDate {
    final dt = DateTime.fromMillisecondsSinceEpoch(timestamp);
    return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
  }

  String get truncatedDriveKey {
    if (driveKey.length <= 12) return driveKey;
    return '${driveKey.substring(0, 6)}...${driveKey.substring(driveKey.length - 6)}';
  }
}
