import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../theme/colors.dart';
import '../../widgets/angular_container.dart';
import '../../widgets/connection_indicator.dart';
import '../services/archive_api.dart';

/// Web settings screen showing node identity and network status.
class WebSettingsScreen extends StatefulWidget {
  const WebSettingsScreen({super.key});

  @override
  State<WebSettingsScreen> createState() => _WebSettingsScreenState();
}

class _WebSettingsScreenState extends State<WebSettingsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ArchiveApi>().fetchStats();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/'),
        ),
        title: Text(
          'Settings',
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(
            height: 1,
            color: SpillColors.divider,
          ),
        ),
      ),
      body: Consumer<ArchiveApi>(
        builder: (context, api, _) {
          return SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Connection status
                AngularContainer(
                  cutSize: 14,
                  color: SpillColors.surface,
                  child: Row(
                    children: [
                      ConnectionIndicator(
                        connected: api.connected,
                        size: 14,
                      ),
                      const SizedBox(width: 12),
                      Text(
                        api.connected ? 'Connected' : 'Disconnected',
                        style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                              color: api.connected
                                  ? SpillColors.success
                                  : SpillColors.accent,
                            ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Node identity
                _SectionHeader(title: 'Node Identity'),
                const SizedBox(height: 8),
                AngularContainer(
                  cutSize: 10,
                  color: SpillColors.surface,
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Public Key',
                        style: Theme.of(context).textTheme.labelSmall,
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              api.nodeId ?? 'Not available',
                              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                    fontFamily: 'JetBrains Mono',
                                    color: api.nodeId != null
                                        ? SpillColors.textPrimary
                                        : SpillColors.textSecondary,
                                  ),
                              overflow: TextOverflow.ellipsis,
                              maxLines: 2,
                            ),
                          ),
                          if (api.nodeId != null)
                            IconButton(
                              icon: const Icon(Icons.copy, size: 16),
                              onPressed: () {
                                Clipboard.setData(
                                  ClipboardData(text: api.nodeId!),
                                );
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text('Public key copied'),
                                    duration: Duration(seconds: 2),
                                  ),
                                );
                              },
                              padding: EdgeInsets.zero,
                              constraints: const BoxConstraints(),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                // Network stats
                _SectionHeader(title: 'Network'),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: _StatCard(
                        label: 'Videos',
                        value: '${api.videos.length}',
                        icon: Icons.videocam_outlined,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _StatCard(
                        label: 'Status',
                        value: api.connected ? 'Online' : 'Offline',
                        icon: Icons.wifi,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                // App info
                _SectionHeader(title: 'Application'),
                const SizedBox(height: 8),
                AngularContainer(
                  cutSize: 10,
                  color: SpillColors.surface,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _InfoRow(label: 'Version', value: '1.0.0'),
                      const Divider(height: 16),
                      _InfoRow(label: 'Runtime', value: 'Node.js + Holepunch'),
                      const Divider(height: 16),
                      _InfoRow(label: 'Protocol', value: 'Hyperswarm'),
                    ],
                  ),
                ),

                // Error display
                if (api.error != null) ...[
                  const SizedBox(height: 24),
                  AngularContainer(
                    cutSize: 10,
                    color: SpillColors.error.withValues(alpha: 0.1),
                    borderColor: SpillColors.error,
                    child: Text(
                      api.error!,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: SpillColors.error,
                          ),
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;

  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 4,
          height: 18,
          decoration: BoxDecoration(
            color: SpillColors.accent,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          title,
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
                color: SpillColors.textSecondary,
              ),
        ),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;

  const _StatCard({
    required this.label,
    required this.value,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return AngularContainer(
      cutSize: 10,
      color: SpillColors.surface,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: SpillColors.textSecondary),
          const SizedBox(height: 8),
          Text(value, style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 2),
          Text(label, style: Theme.of(context).textTheme.labelSmall),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: Theme.of(context).textTheme.labelSmall),
        Text(value, style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}
