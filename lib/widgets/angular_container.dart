import 'package:flutter/material.dart';

import '../theme/colors.dart';

/// A rounded container with soft styling.
///
/// The [cutSize] parameter is kept for API compatibility but is unused.
class AngularContainer extends StatelessWidget {
  final Widget child;
  final double cutSize;
  final Color? color;
  final Color? borderColor;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;

  const AngularContainer({
    super.key,
    required this.child,
    this.cutSize = 16,
    this.color,
    this.borderColor,
    this.padding,
    this.margin,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      decoration: BoxDecoration(
        color: color ?? SpillColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: borderColor ?? SpillColors.divider),
      ),
      padding: padding ?? const EdgeInsets.all(16),
      child: child,
    );
  }
}

/// A button with rounded styling and ripple feedback.
class AngularButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final Color? color;
  final double cutSize;
  final IconData? icon;

  const AngularButton({
    super.key,
    required this.label,
    this.onPressed,
    this.color,
    this.cutSize = 12,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final bgColor = onPressed != null
        ? (color ?? SpillColors.accent)
        : SpillColors.surfaceLight.withValues(alpha: 0.5);
    return Material(
      color: bgColor,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 18, color: Colors.white),
                const SizedBox(width: 8),
              ],
              Text(
                label,
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      color: Colors.white,
                    ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
