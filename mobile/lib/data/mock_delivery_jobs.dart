import '../models/delivery_job.dart';
import '../models/delivery_route.dart';

final _store = const JobStore(
  id: 'preview-store',
  name: 'Bing Chun - Nugegoda',
  addressLine: 'Dawala Road, Nugegoda',
  city: 'Nugegoda',
  lat: 6.8726,
  lng: 79.8897,
);

List<JobOrder> _previewOrders({bool inProgress = false}) => [
      JobOrder(
        orderId: 'o1',
        orderNumber: 'BC-24061',
        sequence: 1,
        status: inProgress ? 'OUT_FOR_DELIVERY' : 'READY',
        paymentMethod: 'CASH_ON_DELIVERY',
        paymentStatus: 'PENDING',
        total: 1280,
        deliveryFee: 150,
        estimatedMinutes: 25,
        customerName: 'Amaya Perera',
        customerPhone: '0771234567',
        addressLine: '45 Station Road',
        city: 'Nugegoda',
        district: 'Colombo',
        lat: 6.8698,
        lng: 79.8934,
        items: const [
          JobOrderItem(productName: 'Bobo Milk Tea', quantity: 2, totalPrice: 900),
          JobOrderItem(productName: 'Brown Sugar Boba', quantity: 1, totalPrice: 380),
        ],
      ),
      JobOrder(
        orderId: 'o2',
        orderNumber: 'BC-24062',
        sequence: 2,
        status: 'READY',
        paymentMethod: 'PAYHERE',
        paymentStatus: 'PAID',
        total: 890,
        deliveryFee: 150,
        estimatedMinutes: 20,
        customerName: 'Dilshan Fernando',
        customerPhone: '0719876543',
        addressLine: '12 Kirillapone Ave',
        city: 'Nugegoda',
        district: 'Colombo',
        lat: 6.8751,
        lng: 79.9012,
        items: const [
          JobOrderItem(productName: 'Strawberry Milkshake', quantity: 1, totalPrice: 550),
          JobOrderItem(productName: 'Fresh Lemonade', quantity: 1, totalPrice: 340),
        ],
      ),
      JobOrder(
        orderId: 'o3',
        orderNumber: 'BC-24063',
        sequence: 3,
        status: 'READY',
        paymentMethod: 'CASH_ON_DELIVERY',
        paymentStatus: 'PENDING',
        total: 2150,
        deliveryFee: 200,
        estimatedMinutes: 30,
        notes: 'Ring doorbell twice',
        customerName: 'Sithmi Jayawardena',
        customerPhone: '0765554433',
        addressLine: '88 High Level Road',
        city: 'Nugegoda',
        district: 'Colombo',
        lat: 6.8642,
        lng: 79.9048,
        items: const [
          JobOrderItem(productName: 'Mango Sundae', quantity: 2, totalPrice: 900),
          JobOrderItem(productName: 'Grape Bobo Tea', quantity: 3, totalPrice: 1250),
        ],
      ),
    ];

DeliveryJobDetail _job({
  required String id,
  required String title,
  required String status,
  List<JobOrder>? orders,
  DateTime? assignedAt,
  DateTime? startedAt,
}) {
  final list = orders ?? _previewOrders();
  final delivered = list.where((o) => o.isDelivered).length;
  return DeliveryJobDetail(
    id: id,
    title: title,
    status: status,
    scheduledAt: DateTime.now().subtract(const Duration(hours: 1)),
    assignedAt: assignedAt,
    startedAt: startedAt,
    store: _store,
    orderCount: list.length,
    deliveredCount: delivered,
    orders: list,
  );
}

class MockJobStore {
  final List<DeliveryJobDetail> _jobs = [
    _job(id: 'job-1', title: 'Morning Run — Nugegoda (3 orders)', status: 'SCHEDULED'),
    _job(id: 'job-2', title: 'Lunch Batch — Kohuwala (2 orders)', status: 'SCHEDULED', orders: [
      JobOrder(
        orderId: 'o4',
        orderNumber: 'BC-24070',
        sequence: 1,
        status: 'READY',
        paymentMethod: 'PAYHERE',
        paymentStatus: 'PAID',
        total: 650,
        deliveryFee: 150,
        estimatedMinutes: 18,
        customerName: 'Kasun Silva',
        customerPhone: '0751122334',
        addressLine: '3 Samagi Mawatha',
        city: 'Kohuwala',
        district: 'Colombo',
        lat: 6.8780,
        lng: 79.8952,
        items: const [JobOrderItem(productName: 'Original Milk Tea', quantity: 1, totalPrice: 500)],
      ),
      JobOrder(
        orderId: 'o5',
        orderNumber: 'BC-24071',
        sequence: 2,
        status: 'READY',
        paymentMethod: 'CASH_ON_DELIVERY',
        paymentStatus: 'PENDING',
        total: 480,
        deliveryFee: 150,
        estimatedMinutes: 15,
        customerName: 'Nethmi',
        customerPhone: '0779988776',
        addressLine: '22 Dehiwala Rd',
        city: 'Nugegoda',
        district: 'Colombo',
        lat: 6.8710,
        lng: 79.8870,
        items: const [JobOrderItem(productName: 'Jasmine Green Tea', quantity: 1, totalPrice: 330)],
      ),
    ]),
  ];

  DeliveryJobDetail? _activeJob;

  List<JobSummary> listSummaries() {
    final summaries = _jobs
        .where((j) => j.status == 'SCHEDULED')
        .map(
          (j) => JobSummary(
            id: j.id,
            title: j.title,
            status: j.status,
            scheduledAt: j.scheduledAt,
            storeName: j.store.name,
            storeCity: j.store.city,
            orderCount: j.orderCount,
            isMine: false,
          ),
        )
        .toList();

    if (_activeJob != null) {
      summaries.insert(
        0,
        JobSummary(
          id: _activeJob!.id,
          title: _activeJob!.title,
          status: _activeJob!.status,
          scheduledAt: _activeJob!.scheduledAt,
          assignedAt: _activeJob!.assignedAt,
          storeName: _activeJob!.store.name,
          storeCity: _activeJob!.store.city,
          orderCount: _activeJob!.orderCount,
          isMine: true,
        ),
      );
    }
    return summaries;
  }

  DeliveryJobDetail? getActiveJob() => _activeJob;

  DeliveryJobDetail getJob(String id) {
    if (_activeJob?.id == id) return _activeJob!;
    return _jobs.firstWhere((j) => j.id == id);
  }

  DeliveryJobDetail assignJob(String id) {
    if (_activeJob != null) throw Exception('Complete your current job first');
    final idx = _jobs.indexWhere((j) => j.id == id);
    if (idx < 0) throw Exception('Job not found');
    final job = _jobs.removeAt(idx);
    _activeJob = DeliveryJobDetail(
      id: job.id,
      title: job.title,
      status: 'ASSIGNED',
      scheduledAt: job.scheduledAt,
      assignedAt: DateTime.now(),
      store: job.store,
      orderCount: job.orderCount,
      deliveredCount: job.deliveredCount,
      orders: job.orders,
    );
    return _activeJob!;
  }

  DeliveryJobDetail pickupJob(String id) {
    final job = _requireActive(id);
    _activeJob = job.copyWith(pickedUp: true);
    return _activeJob!;
  }

  DeliveryJobDetail startJob(String id) {
    final job = _requireActive(id);
    _activeJob = DeliveryJobDetail(
      id: job.id,
      title: job.title,
      status: 'IN_PROGRESS',
      scheduledAt: job.scheduledAt,
      assignedAt: job.assignedAt,
      startedAt: DateTime.now(),
      store: job.store,
      orderCount: job.orderCount,
      deliveredCount: job.deliveredCount,
      orders: job.orders
          .map(
            (o) => JobOrder(
              orderId: o.orderId,
              orderNumber: o.orderNumber,
              sequence: o.sequence,
              status: o.status == 'READY' ? 'OUT_FOR_DELIVERY' : o.status,
              paymentMethod: o.paymentMethod,
              paymentStatus: o.paymentStatus,
              total: o.total,
              deliveryFee: o.deliveryFee,
              estimatedMinutes: o.estimatedMinutes,
              notes: o.notes,
              customerName: o.customerName,
              customerPhone: o.customerPhone,
              addressLine: o.addressLine,
              city: o.city,
              district: o.district,
              lat: o.lat,
              lng: o.lng,
              items: o.items,
            ),
          )
          .toList(),
    );
    return _activeJob!;
  }

  JobOrder updateOrderStatus(String orderId, String status) {
    final job = _activeJob;
    if (job == null || job.status != 'IN_PROGRESS') throw Exception('No active job');
    final orders = job.orders.map((o) {
      if (o.orderId != orderId) return o;
      return JobOrder(
        orderId: o.orderId,
        orderNumber: o.orderNumber,
        sequence: o.sequence,
        status: status == 'DELIVERY_FAILED' ? o.status : status,
        paymentMethod: o.paymentMethod,
        paymentStatus: status == 'DELIVERED' && o.paymentMethod == 'CASH_ON_DELIVERY' ? 'PAID' : o.paymentStatus,
        total: o.total,
        deliveryFee: o.deliveryFee,
        estimatedMinutes: o.estimatedMinutes,
        notes: o.notes,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        addressLine: o.addressLine,
        city: o.city,
        district: o.district,
        lat: o.lat,
        lng: o.lng,
        items: o.items,
      );
    }).toList();
    final delivered = orders.where((o) => o.isDelivered).length;
    _activeJob = DeliveryJobDetail(
      id: job.id,
      title: job.title,
      status: job.status,
      scheduledAt: job.scheduledAt,
      assignedAt: job.assignedAt,
      startedAt: job.startedAt,
      store: job.store,
      orderCount: orders.length,
      deliveredCount: delivered,
      orders: orders,
    );
    return orders.firstWhere((o) => o.orderId == orderId);
  }

  DeliveryJobDetail completeJob(String id) {
    final job = _requireActive(id);
    if (!job.allDelivered) throw Exception('Deliver all orders first');
    final completed = DeliveryJobDetail(
      id: job.id,
      title: job.title,
      status: 'COMPLETED',
      scheduledAt: job.scheduledAt,
      assignedAt: job.assignedAt,
      startedAt: job.startedAt,
      completedAt: DateTime.now(),
      store: job.store,
      orderCount: job.orderCount,
      deliveredCount: job.deliveredCount,
      orders: job.orders,
    );
    _activeJob = null;
    return completed;
  }

  DeliveryRoute jobRoute(String id) {
    final job = getJob(id);
    final pending = job.orders.where((o) => o.isPending && o.lat != null && o.lng != null).toList();
    final stops = pending.asMap().entries.map((e) {
      final o = e.value;
      return RouteStop(
        orderId: o.orderId,
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        addressLine: o.addressLine,
        city: o.city,
        district: o.district,
        status: o.status,
        total: o.total,
        itemCount: o.items.fold(0, (n, i) => n + i.quantity),
        lat: o.lat!,
        lng: o.lng!,
        sequence: e.key + 1,
        distanceFromPreviousKm: 0.5 + e.key * 0.4,
        etaMinutesFromPrevious: 5 + e.key * 2,
      );
    }).toList();

    return DeliveryRoute(
      store: RouteStore(
        id: job.store.id,
        name: job.store.name,
        addressLine: job.store.addressLine,
        city: job.store.city,
        lat: job.store.lat,
        lng: job.store.lng,
      ),
      stops: stops,
      summary: RouteSummary(
        stopCount: stops.length,
        totalDistanceKm: stops.fold(0.0, (n, s) => n + s.distanceFromPreviousKm),
        estimatedMinutes: stops.fold(0, (n, s) => n + s.etaMinutesFromPrevious),
        generatedAt: DateTime.now(),
      ),
    );
  }

  DeliveryJobDetail _requireActive(String id) {
    if (_activeJob == null || _activeJob!.id != id) throw Exception('Active job not found');
    return _activeJob!;
  }
}

final mockJobStore = MockJobStore();
