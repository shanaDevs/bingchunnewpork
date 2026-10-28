import 'package:bing_chun_driver/data/network/api_client.dart';
import 'package:bing_chun_driver/data/network/api_exception.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('timeouts become a plain sentence, never Dio internals', () {
    final msg = networkErrorMessage(DioExceptionType.receiveTimeout);
    expect(msg, contains('taking too long'));
    expect(msg, isNot(contains('RequestOptions')));
    expect(msg, isNot(contains('0:00:20')));
  });

  test('connection failures ask the rider to check their connection', () {
    expect(networkErrorMessage(DioExceptionType.connectionError), contains("Can't connect"));
    expect(networkErrorMessage(DioExceptionType.unknown), contains("Can't connect"));
  });

  test('errorMessage hides technical exception text behind the fallback', () {
    final raw = Exception(
      'DioException [receive timeout]: The request took longer than 0:00:20.000000 to receive data. '
      'To get rid of this exception, try raising the RequestOptions.receiveTimeout',
    );
    expect(errorMessage(raw, 'Failed to load jobs'), 'Failed to load jobs');
    expect(errorMessage(StateError('Location is off')), 'Location is off');
    expect(errorMessage(Exception('Job rejected.')), 'Job rejected.');
  });
}
