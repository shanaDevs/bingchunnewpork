import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/feedback.dart';
import '../../l10n/l10n.dart';
import '../../state/jobs_controller.dart';
import '../theme/bc_theme.dart';
import 'profile_kit.dart';
import 'sheet_kit.dart';

/// Lets the rider take or choose a profile photo, uploads it and refreshes the profile.
/// Returns true when the photo was changed.
Future<bool> changeProfilePhoto(BuildContext context) async {
  final source = await showBcSheet<ImageSource>(
    context,
    builder: (ctx) => BcSheetBody(
      header: BcSheetHeader(title: tr('Profile photo')),
      children: [
        QdGroup(
          children: [
            QdRow(icon: Icons.photo_camera_outlined, title: tr('Take photo'), onTap: () => Navigator.of(ctx).pop(ImageSource.camera)),
            QdRow(icon: Icons.photo_library_outlined, title: tr('Choose from library'), onTap: () => Navigator.of(ctx).pop(ImageSource.gallery)),
          ],
        ),
      ],
    ),
  );
  if (source == null || !context.mounted) return false;
  final container = context.read<AppContainer>();
  final vm = context.read<JobsController>();
  final messenger = ScaffoldMessenger.of(context);
  try {
    final picked = await ImagePicker().pickImage(
      source: source,
      maxWidth: 1024,
      maxHeight: 1024,
      imageQuality: 85,
      preferredCameraDevice: CameraDevice.front,
    );
    if (picked == null) return false;
    await container.authRepository.uploadProfilePhoto(picked.path);
    await vm.refreshProfile();
    BcFeedback.success();
    messenger.showSnackBar(SnackBar(content: Text(tr('Profile photo updated.'))));
    return true;
  } catch (_) {
    BcFeedback.error();
    messenger.showSnackBar(SnackBar(content: Text(tr("Couldn't update your photo. Check your connection and try again."))));
    return false;
  }
}

/// Avatar with a small camera badge; tapping it runs [changeProfilePhoto].
class EditableAvatar extends StatefulWidget {
  const EditableAvatar({super.key, required this.name, this.photoUrl, this.size = 72});
  final String name;
  final String? photoUrl;
  final double size;

  @override
  State<EditableAvatar> createState() => _EditableAvatarState();
}

class _EditableAvatarState extends State<EditableAvatar> {
  bool _busy = false;

  Future<void> _tap() async {
    if (_busy) return;
    setState(() => _busy = true);
    await changeProfilePhoto(context);
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final badge = (widget.size * 0.32).clamp(22.0, 32.0);
    return Semantics(
      button: true,
      label: tr('Change profile photo'),
      child: GestureDetector(
        onTap: _tap,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            QdAvatar(name: widget.name, photoUrl: widget.photoUrl, size: widget.size),
            if (_busy)
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(shape: BoxShape.circle, color: c.scrim.withValues(alpha: 0.4)),
                  child: const Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5))),
                ),
              ),
            Positioned(
              right: -2,
              bottom: -2,
              child: Container(
                width: badge,
                height: badge,
                decoration: BoxDecoration(shape: BoxShape.circle, color: c.primary, border: Border.all(color: c.background, width: 2)),
                child: Icon(Icons.photo_camera_rounded, size: badge * 0.55, color: Colors.white),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
