import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';

import '../models/content_type.dart';
import '../models/video_meta.dart';
import '../services/p2p_service.dart';
import '../theme/colors.dart';

/// Displays a video thumbnail with cache/fetch/fallback logic.
///
/// 1. Checks local disk cache at `{tempDir}/thumbs/{video.id}.jpg`
/// 2. If not cached and `video.thumbKey != null`, fetches via P2P
/// 3. Falls back to gradient placeholder with play icon
class ThumbnailImage extends StatefulWidget {
  final VideoMeta video;

  const ThumbnailImage({super.key, required this.video});

  @override
  State<ThumbnailImage> createState() => _ThumbnailImageState();
}

class _ThumbnailImageState extends State<ThumbnailImage> {
  File? _cachedFile;
  bool _loading = false;
  bool _attempted = false;

  @override
  void initState() {
    super.initState();
    _loadThumbnail();
  }

  @override
  void didUpdateWidget(ThumbnailImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.video.id != widget.video.id) {
      _cachedFile = null;
      _loading = false;
      _attempted = false;
      _loadThumbnail();
    }
  }

  Future<void> _loadThumbnail() async {
    if (_attempted) return;
    _attempted = true;

    // Audio and documents have no thumbnail — show placeholder immediately
    if (widget.video.isAudio || widget.video.isDocument) return;

    try {
      final tmpDir = await getTemporaryDirectory();

      // For images, use the content file itself as thumbnail
      if (widget.video.isImage) {
        final ext = widget.video.fileKey.contains('.')
            ? widget.video.fileKey.substring(widget.video.fileKey.lastIndexOf('.'))
            : '.jpg';
        final imgFile = File('${tmpDir.path}/${widget.video.id}$ext');
        if (imgFile.existsSync() && imgFile.lengthSync() > 0) {
          if (mounted) setState(() => _cachedFile = imgFile);
          return;
        }

        // Not cached — fetch the image file
        if (!mounted) return;
        setState(() => _loading = true);

        final p2p = context.read<P2pService>();
        await p2p.fetchVideo(
          widget.video.driveKey,
          widget.video.fileKey,
          imgFile.path,
        );

        if (mounted && imgFile.existsSync() && imgFile.lengthSync() > 0) {
          setState(() {
            _cachedFile = imgFile;
            _loading = false;
          });
        } else if (mounted) {
          setState(() => _loading = false);
        }
        return;
      }

      // Video (or unknown): use dedicated thumbnail
      final thumbsDir = Directory('${tmpDir.path}/thumbs');
      thumbsDir.createSync(recursive: true);

      final file = File('${thumbsDir.path}/${widget.video.id}.jpg');

      if (file.existsSync() && file.lengthSync() > 0) {
        if (mounted) setState(() => _cachedFile = file);
        return;
      }

      if (widget.video.thumbKey == null) return;

      if (!mounted) return;
      setState(() => _loading = true);

      final p2p = context.read<P2pService>();
      await p2p.fetchThumbnail(
        widget.video.driveKey,
        widget.video.thumbKey!,
        file.path,
      );

      if (mounted && file.existsSync() && file.lengthSync() > 0) {
        setState(() {
          _cachedFile = file;
          _loading = false;
        });
      } else if (mounted) {
        setState(() => _loading = false);
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_cachedFile != null) {
      return SizedBox.expand(
        child: Image.file(
          _cachedFile!,
          fit: BoxFit.cover,
          errorBuilder: (_, _, _) => _buildPlaceholder(),
        ),
      );
    }

    if (_loading) {
      return _buildPlaceholder(showSpinner: true);
    }

    return _buildPlaceholder();
  }

  Widget _buildPlaceholder({bool showSpinner = false}) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            SpillColors.surface,
            SpillColors.surfaceLight,
            SpillColors.accent.withValues(alpha: 0.08),
          ],
        ),
      ),
      child: Center(
        child: showSpinner
            ? const SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : Icon(
                widget.video.isVideo
                    ? Icons.play_circle_outline
                    : contentTypeIcon(widget.video.contentType),
                size: 48,
                color: SpillColors.textSecondary.withValues(alpha: 0.5),
              ),
      ),
    );
  }
}
