class ApiException implements Exception {
  const ApiException(this.message, {this.status = 0, this.code});

  final String message;
  final int status;
  final String? code;

  bool get isAuth => status == 401;
  bool get isNetwork => status == 0;

  @override
  String toString() => message;
}
