import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/delivery_job.dart';
import '../theme/bc_theme.dart';
import 'job_status_chip.dart';

class JobCard extends StatelessWidget {
  final JobSummary job;
  final VoidCallback onTap;

  const JobCard({super.key, required this.job, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final time = DateFormat('EEE, MMM d · HH:mm').format(job.scheduledAt);

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(job.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  ),
                  JobStatusChip(status: job.status),
                ],
              ),
              const SizedBox(height: 8),
              Text(job.storeName, style: const TextStyle(color: BcColors.textMuted, fontSize: 13)),
              const SizedBox(height: 10),
              Row(
                children: [
                  const Icon(Icons.schedule, size: 14, color: BcColors.textMuted),
                  const SizedBox(width: 4),
                  Text(time, style: const TextStyle(fontSize: 12, color: BcColors.textMuted)),
                  const Spacer(),
                  Text(
                    '${job.orderCount} orders',
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: BcColors.brandLight),
                  ),
                  if (job.isMine) ...[
                    const SizedBox(width: 8),
                    const Icon(Icons.person_pin_circle_rounded, size: 16, color: BcColors.accent),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
