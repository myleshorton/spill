import 'package:flutter/material.dart';

import '../models/content_type.dart';
import '../models/video_meta.dart';
import '../theme/colors.dart';
import 'thumbnail_image.dart';

/// A video thumbnail card with soft rounded styling.
///
/// Shows a placeholder thumbnail with rounded corners,
/// bold title, channel key, and peer count.
class VideoCard extends StatelessWidget {
  final VideoMeta video;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final Widget? overlay;

  const VideoCard({
    super.key,
    required this.video,
    this.onTap,
    this.onLongPress,
    this.overlay,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      onLongPress: onLongPress,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Thumbnail area with rounded corners
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: AspectRatio(
              aspectRatio: 16 / 9,
              child: Container(
                color: SpillColors.surface,
                child: Stack(
                  children: [
                    ThumbnailImage(video: video),
                    // Content-type badge for non-video content
                    if (!video.isVideo)
                      Positioned(
                        top: 8,
                        left: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(6),
                            color: SpillColors.background.withValues(alpha: 0.8),
                          ),
                          child: Icon(
                            contentTypeIcon(video.contentType),
                            size: 16,
                            color: SpillColors.accent,
                          ),
                        ),
                      ),
                    // Overlay widget (e.g. menu button)
                    if (overlay != null)
                      Positioned(
                        top: 4,
                        right: 4,
                        child: overlay!,
                      ),
                    // Peer count badge
                    Positioned(
                      bottom: 8,
                      right: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(8),
                          color: SpillColors.background.withValues(alpha: 0.8),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 6,
                              height: 6,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: video.peerCount > 0
                                    ? SpillColors.success
                                    : SpillColors.textSecondary,
                              ),
                            ),
                            const SizedBox(width: 4),
                            Text(
                              '${video.peerCount} peers',
                              style: Theme.of(context).textTheme.labelSmall,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          // Title
          Text(
            video.title,
            style: Theme.of(context).textTheme.headlineSmall,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          // Publisher + date
          Row(
            children: [
              Icon(
                video.publisherName != null
                    ? Icons.person_outline
                    : Icons.vpn_key_outlined,
                size: 12,
                color: SpillColors.textSecondary.withValues(alpha: 0.7),
              ),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  video.publisherName ?? video.truncatedDriveKey,
                  style: Theme.of(context).textTheme.labelSmall,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Text(
                video.formattedDate,
                style: Theme.of(context).textTheme.labelSmall,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
