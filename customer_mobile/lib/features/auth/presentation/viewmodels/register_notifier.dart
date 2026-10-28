import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/connectivity.dart';
import '../providers/auth_dependencies.dart';
import '../providers/session_provider.dart';
import '../states/register_state.dart';

class RegisterNotifier extends Notifier<RegisterState> {
  final _monitor = NetworkMonitor();

  @override
  RegisterState build() => const RegisterState();

  void setReferral(String? code) {
    state = state.copyWith(referralCode: code);
  }

  void setPhone(String phone) {
    state = state.copyWith(phone: phone, clearError: true, existingPhone: false);
  }

  void setName(String name) {
    state = state.copyWith(name: name, clearError: true);
  }

  Future<bool> checkPhone() async {
    if (!await _monitor.isOnline) {
      state = state.copyWith(offline: true);
      return false;
    }
    state = state.copyWith(
      submitting: false,
      clearError: true,
      offline: false,
      step: RegisterStep.details,
    );
    return true;
  }

  Future<bool> sendCode() async {
    if (!await _monitor.isOnline) {
      state = state.copyWith(offline: true);
      return false;
    }
    state = state.copyWith(submitting: true, clearError: true, offline: false);
    final result = await ref.read(requestOtpProvider)(
      phone: state.phone,
      referralCode: state.referralCode,
    );
    if (result.isFailure) {
      state = state.withFailure(result.failure!);
      return false;
    }
    state = state.copyWith(
      submitting: false,
      step: RegisterStep.otp,
      debugOtp: result.data,
    );
    return true;
  }

  Future<bool> verify(String code) async {
    if (!await _monitor.isOnline) {
      state = state.copyWith(offline: true);
      return false;
    }
    state = state.copyWith(submitting: true, clearError: true, offline: false);
    final verified = await ref.read(verifyOtpProvider)(
      phone: state.phone,
      code: code,
      referralCode: state.referralCode,
    );
    if (verified.isFailure) {
      state = state.withFailure(verified.failure!);
      return false;
    }
    final profile = await ref.read(completeRegistrationProvider)(
      name: state.name,
      referralCode: state.referralCode,
    );
    if (profile.isFailure) {
      ref.read(authSessionProvider.notifier).signedIn(verified.data!.user);
      state = state.withFailure(profile.failure!);
      return false;
    }
    ref.read(authSessionProvider.notifier).signedIn(profile.data!);
    state = state.copyWith(submitting: false);
    return true;
  }

  Future<bool> resend() => sendCode();
}
