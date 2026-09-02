/// The client.
///
/// Every response comes back in the same envelope, so failure is a value rather
/// than an exception for the ordinary cases — a geofence refusal and an
/// already-checked-in are both normal traffic, not exceptional conditions, and
/// forcing a try/catch around them makes callers write worse code.
///
/// Transport failures DO throw: a socket that never opened is not the API
/// declining, and pretending otherwise loses the distinction the caller most
/// needs.
library;

import 'dart:convert';

import 'package:http/http.dart' as http;

import 'models.dart';

/// A refusal the API returned deliberately, with a code the caller can branch on.
class ApiError implements Exception {
  const ApiError(this.code, this.message, this.status);

  /// Machine-readable: OUTSIDE_GEOFENCE, NEVER_VISITED, INSUFFICIENT_POINTS...
  final String code;

  /// Written for a person to read. Show this, do not rewrite it.
  final String message;
  final int status;

  @override
  String toString() => 'ApiError($code, $status): $message';
}

/// Either a value or a refusal. Never both, never neither.
sealed class Result<T> {
  const Result();

  bool get isOk => this is Ok<T>;

  /// The value, or null when this was a refusal.
  T? get valueOrNull => this is Ok<T> ? (this as Ok<T>).value : null;

  /// The refusal, or null when this succeeded.
  ApiError? get errorOrNull => this is Failed<T> ? (this as Failed<T>).error : null;

  R fold<R>(R Function(T value) onOk, R Function(ApiError error) onError) =>
      this is Ok<T> ? onOk((this as Ok<T>).value) : onError((this as Failed<T>).error);
}

final class Ok<T> extends Result<T> {
  const Ok(this.value);
  final T value;
}

final class Failed<T> extends Result<T> {
  const Failed(this.error);
  final ApiError error;
}

class ChivagoClient {
  ChivagoClient({
    required this.baseUrl,
    required this.userId,
    this.deviceKey,
    http.Client? httpClient,
  }) : _http = httpClient ?? http.Client();

  final String baseUrl;

  /// Who the caller is. Informational once a [deviceKey] is set: the server
  /// resolves identity from the key and ignores this header.
  final String userId;

  /// This device's credential, from [registerDevice]. Without it the server
  /// answers 401 to everything except registration the moment ANY account
  /// exists - which every phone running the app has, because it registers on
  /// first launch. The bare `x-chivago-user` header was the pilot's escape
  /// hatch and it closed itself; a client built without a key is a client
  /// that works only on an empty database.
  final String? deviceKey;

  final http.Client _http;

  void close() => _http.close();

  Map<String, String> get _headers => {
        'x-chivago-user': userId,
        if (deviceKey != null) 'x-chivago-device-key': deviceKey!,
        'content-type': 'application/json',
      };

  // -- account --------------------------------------------------------------

  /// Register this device and receive its key - ONCE. Only a hash is stored
  /// server-side, so a lost key is a lost account unless it was linked to a
  /// second device first. Unauthenticated by necessity, and rate-limited per
  /// address for that reason.
  ///
  /// Static because it is the one call made before a client has a key. Build
  /// the client you will keep from the result.
  static Future<Result<RegisteredDevice>> registerDevice(
    String baseUrl, {
    String? label,
    String? locale,
    http.Client? httpClient,
  }) async {
    final bootstrap = ChivagoClient(baseUrl: baseUrl, userId: '', httpClient: httpClient);
    try {
      return await bootstrap._post(
        '/devices',
        (d) => RegisteredDevice.fromJson(d as Map<String, dynamic>),
        {'label': label, 'locale': locale},
      );
    } finally {
      if (httpClient == null) bootstrap.close();
    }
  }

  /// Who this key belongs to, and which phones share the account.
  Future<Result<Account>> account() =>
      _get('/account', (d) => Account.fromJson(d as Map<String, dynamic>));

  Future<Result<T>> _send<T>(
    String method,
    String path,
    T Function(dynamic data) decode, {
    Object? body,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    final request = http.Request(method, uri)..headers.addAll(_headers);
    if (body != null) request.body = jsonEncode(body);

    final streamed = await _http.send(request);
    final response = await http.Response.fromStream(streamed);
    final json = jsonDecode(response.body) as Map<String, dynamic>;

    if (json['ok'] == true) return Ok(decode(json['data']));
    return Failed(
      ApiError(
        json['code'] as String? ?? 'UNKNOWN',
        json['error'] as String? ?? 'Request failed',
        response.statusCode,
      ),
    );
  }

  Future<Result<T>> _get<T>(String path, T Function(dynamic) decode) =>
      _send('GET', path, decode);

  Future<Result<T>> _post<T>(String path, T Function(dynamic) decode, [Object? body]) =>
      _send('POST', path, decode, body: body ?? const <String, dynamic>{});

  static List<T> _list<T>(dynamic data, T Function(Map<String, dynamic>) item) =>
      (data as List<dynamic>).map((e) => item(e as Map<String, dynamic>)).toList();

  // -- places ---------------------------------------------------------------

  Future<Result<List<Place>>> places() =>
      _get('/places', (d) => _list(d, Place.fromJson));

  Future<Result<Place>> place(String id) =>
      _get('/places/$id', (d) => Place.fromJson(d as Map<String, dynamic>));

  /// Check in. The SERVER decides whether you are close enough — a client that
  /// judges its own geofence is a client that can be told to lie.
  ///
  /// `awarded: false` means you are here and already checked in today. That is
  /// a success, not a refusal.
  ///
  /// `accuracyM` is the fix's own error radius. Send it: a fix wider than the
  /// place's fence is refused, and the server would rather say so than guess.
  ///
  /// `mocked` is whether the OS flagged the fix as simulated. Send it when the
  /// platform reports it (Android's `isFromMockProvider`); a mocked fix is
  /// refused with MOCK_LOCATION.
  Future<Result<CheckinResult>> checkIn(
    String placeId, {
    required double lat,
    required double lng,
    double? accuracyM,
    bool? mocked,
  }) =>
      _post(
        '/places/$placeId/checkin',
        (d) => CheckinResult.fromJson(d as Map<String, dynamic>),
        {
          'lat': lat,
          'lng': lng,
          if (accuracyM != null) 'accuracyM': accuracyM,
          if (mocked != null) 'mocked': mocked,
        },
      );

  /// Note a visit the phone could not prove. Recorded, not scored: it pays
  /// nothing, unlocks nothing, and reaches only the passport as a dashed
  /// stamp. Ten a year; VISIT_QUOTA when they are spent.
  Future<Result<SelfVisitResult>> recordVisit(String placeId) => _post(
        '/places/$placeId/visits',
        (d) => SelfVisitResult.fromJson(d as Map<String, dynamic>),
      );

  Future<Result<List<String>>> checkinsToday() =>
      _get('/checkins/today', (d) => (d as List<dynamic>).cast<String>());

  // -- recorded, not scored ----------------------------------------------
  /// Stamps the traveller issued themselves, and how many the year still
  /// allows. They pay nothing and unlock nothing; the passport draws them
  /// dashed.
  Future<Result<SelfVisits>> selfVisits() =>
      _get('/visits/self', (d) => SelfVisits.fromJson(d as Map<String, dynamic>));

  /// Which provinces this traveller has been to - verified and self-reported
  /// kept apart - plus the evidence the companions grow from.
  Future<Result<Passport>> passport() =>
      _get('/passport', (d) => Passport.fromJson(d as Map<String, dynamic>));

  // -- the evidence layer --------------------------------------------------
  /// Statements a host filed that count this traveller's verified work. The
  /// id is public: `/verify/<id>` on the API shows anyone the same record.
  Future<Result<List<FiledStatement>>> myStatements() => _get(
        '/me/statements',
        (d) => _list((d as Map<String, dynamic>)['statements'], FiledStatement.fromJson),
      );

  // -- quests ---------------------------------------------------------------

  Future<Result<List<Quest>>> quests() => _get(
        '/quests',
        (d) => _list((d as Map<String, dynamic>)['quests'], Quest.fromJson),
      );

  // -- wallet ---------------------------------------------------------------

  Future<Result<Wallet>> wallet() =>
      _get('/wallet', (d) => Wallet.fromJson(d as Map<String, dynamic>));

  Future<Result<List<Offer>>> offers() =>
      _get('/offers', (d) => _list(d, Offer.fromJson));

  Future<Result<List<Voucher>>> vouchers() =>
      _get('/vouchers', (d) => _list(d, Voucher.fromJson));

  /// Redeem. Fails with INSUFFICIENT_POINTS naming the currency that was short
  /// — with two purses, "not enough points" is not an answer.
  Future<Result<Voucher>> redeem(String offerId) => _post(
        '/offers/$offerId/redeem',
        (d) => Voucher.fromJson((d as Map<String, dynamic>)['voucher'] as Map<String, dynamic>),
      );

  // -- reviews --------------------------------------------------------------

  /// Every review here is from somebody the server confirmed was at the place.
  /// Not because it filters — because an unverified one cannot be written.
  Future<Result<List<PlaceReview>>> reviews(String placeId) => _get(
        '/places/$placeId/reviews',
        (d) => _list((d as Map<String, dynamic>)['reviews'], PlaceReview.fromJson),
      );

  Future<Result<PlaceReview>> writeReview(
    String placeId, {
    required int rating,
    String? body,
  }) =>
      _post(
        '/places/$placeId/reviews',
        (d) => PlaceReview.fromJson(
          (d as Map<String, dynamic>)['review'] as Map<String, dynamic>,
        ),
        {'rating': rating, 'body': body},
      );

  /// Report a review. This hides NOTHING: it puts the review in front of a
  /// moderator, and no count anywhere trips a switch.
  Future<Result<void>> reportReview(
    String reviewId, {
    required String reason,
    String? note,
  }) =>
      _post('/reviews/$reviewId/report', (_) {}, {'reason': reason, 'note': note});
}
