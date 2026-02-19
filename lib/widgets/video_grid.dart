import 'package:flutter/material.dart';

import '../models/video_meta.dart';
import 'video_card.dart';

/// A responsive grid of video cards.
///
/// Adjusts column count based on screen width:
/// - < 600px: 1 column (phone portrait)
/// - < 900px: 2 columns (phone landscape / small tablet)
/// - < 1200px: 3 columns (tablet / small desktop)
/// - >= 1200px: 4 columns (desktop)
class VideoGrid extends StatelessWidget {
  final List<VideoMeta> videos;
  final void Function(VideoMeta video)? onVideoTap;
  final void Function(VideoMeta video)? onVideoLongPress;
  final Widget Function(VideoMeta video)? overlayBuilder;

  const VideoGrid({
    super.key,
    required this.videos,
    this.onVideoTap,
    this.onVideoLongPress,
    this.overlayBuilder,
  });

  int _crossAxisCount(double width) {
    if (width < 600) return 1;
    if (width < 900) return 2;
    if (width < 1200) return 3;
    return 4;
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = _crossAxisCount(constraints.maxWidth);
        return GridView.builder(
          padding: const EdgeInsets.all(16),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            crossAxisSpacing: 16,
            mainAxisSpacing: 12,
            childAspectRatio: 1.05,
          ),
          itemCount: videos.length,
          itemBuilder: (context, index) {
            final video = videos[index];
            return VideoCard(
              video: video,
              onTap: onVideoTap != null ? () => onVideoTap!(video) : null,
              onLongPress: onVideoLongPress != null ? () => onVideoLongPress!(video) : null,
              overlay: overlayBuilder?.call(video),
            );
          },
        );
      },
    );
  }
}
