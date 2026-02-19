import 'package:flutter/material.dart';

const _videoExts = {'.mp4', '.mov', '.avi', '.mkv', '.webm'};
const _audioExts = {'.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'};
const _imageExts = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'};
const _documentExts = {'.pdf', '.doc', '.docx', '.txt', '.rtf', '.xls', '.xlsx'};

/// All file extensions supported for publishing.
const supportedExtensions = [
  'mp4', 'mov', 'avi', 'mkv', 'webm',
  'mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp',
  'pdf', 'doc', 'docx', 'txt', 'rtf', 'xls', 'xlsx',
];

/// Detect content type from a filename's extension.
/// Returns 'video', 'audio', 'image', or 'document'.
String detectContentType(String filename) {
  final dotIndex = filename.lastIndexOf('.');
  if (dotIndex < 0) return 'document';
  final ext = filename.substring(dotIndex).toLowerCase();
  if (_videoExts.contains(ext)) return 'video';
  if (_audioExts.contains(ext)) return 'audio';
  if (_imageExts.contains(ext)) return 'image';
  if (_documentExts.contains(ext)) return 'document';
  return 'document';
}

/// Icon for a given content type string.
IconData contentTypeIcon(String contentType) {
  switch (contentType) {
    case 'video':
      return Icons.videocam;
    case 'audio':
      return Icons.audiotrack;
    case 'image':
      return Icons.image;
    case 'document':
      return Icons.description;
    default:
      return Icons.insert_drive_file;
  }
}
