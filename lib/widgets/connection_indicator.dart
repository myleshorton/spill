import 'package:flutter/material.dart';

import '../theme/colors.dart';

/// A pulsing dot that indicates P2P connection status.
///
/// Green = connected, red = disconnected.
/// Pulses when connected to show active networking.
class ConnectionIndicator extends StatefulWidget {
  final bool connected;
  final double size;

  const ConnectionIndicator({
    super.key,
    required this.connected,
    this.size = 10,
  });

  @override
  State<ConnectionIndicator> createState() => _ConnectionIndicatorState();
}

class _ConnectionIndicatorState extends State<ConnectionIndicator>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    );
    _animation = Tween<double>(begin: 0.6, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );

    if (widget.connected) {
      _controller.repeat(reverse: true);
    }
  }

  @override
  void didUpdateWidget(ConnectionIndicator oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.connected && !_controller.isAnimating) {
      _controller.repeat(reverse: true);
    } else if (!widget.connected && _controller.isAnimating) {
      _controller.stop();
      _controller.value = 1.0;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color =
        widget.connected ? SpillColors.success : SpillColors.accent;

    return AnimatedBuilder(
      animation: _animation,
      builder: (context, child) {
        return Container(
          width: widget.size,
          height: widget.size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: color.withValues(alpha: widget.connected ? _animation.value : 1.0),
            boxShadow: [
              BoxShadow(
                color: color.withValues(alpha: 0.4),
                blurRadius: widget.connected ? 8 : 4,
                spreadRadius: widget.connected ? 2 : 0,
              ),
            ],
          ),
        );
      },
    );
  }
}
