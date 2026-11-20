// Reads orders (with items, errands, history and rider) in the shape the apps use.
const SQL = `
  select o.*,
    coalesce((select json_agg(json_build_object('productId', i.product_id, 'qty', i.qty, 'name', i.name, 'unitPrice', i.unit_price) order by i.id)
              from order_items i where i.order_id = o.id), '[]') as items,
    coalesce((select json_agg(json_build_object('id', e.id::text, 'type', e.type, 'title', e.title, 'details', e.details,
                     'pickupSpotId', e.spot_id, 'estMin', e.est_min, 'budget', e.budget, 'fee', e.fee) order by e.id)
              from order_errands e where e.order_id = o.id), '[]') as errands,
    coalesce((select json_agg(json_build_object('status', ev.status, 'at', ev.at) order by ev.id)
              from order_events ev where ev.order_id = o.id), '[]') as events,
    (select to_json(r) from riders r where r.id = o.rider_id) as rider
  from orders o
  where (o.customer_id = auth.uid() or o.rider_id = auth.uid())`;

function toRider(r) {
  if (!r) return undefined;
  return {
    name: r.display_name,
    phone: r.phone,
    vehicle: r.vehicle === 'bicycle' ? 'Bicycle' : 'Motorbike',
    plate: r.plate,
    rating: Number(r.rating),
    trips: r.trips,
    checks: [r.nin_verified && 'NIN verified', r.guarantor_confirmed && 'Guarantor confirmed', r.address_visited && 'Home address visited'].filter(Boolean),
  };
}

export function toOrder(o) {
  const statusTimes = {};
  for (const e of o.events) statusTimes[e.status] = new Date(e.at).getTime();
  return {
    id: o.id,
    code: o.code,
    createdAt: new Date(o.created_at).getTime(),
    lines: o.items.map((i) => ({ productId: i.productId, qty: i.qty })),
    errands: o.errands.map(({ fee, ...e }) => e),
    address: o.address,
    quote: o.quote,
    bill: {
      items: o.items_total,
      errandPurchases: o.errand_purchases,
      errandFees: o.errand_fees,
      serviceCharge: o.service_charge,
      delivery: o.delivery_fee,
      smallOrderFee: o.small_order_fee,
      total: o.total,
    },
    payment: o.payment_method,
    paymentStatus: o.payment_status,
    status: o.status,
    statusTimes,
    rider: toRider(o.rider),
    etaMin: o.eta_min,
  };
}

/** Orders visible to the current database user (row level security filters the rest). */
export async function listOrders(client, { limit = 50, activeOnly = false } = {}) {
  const where = activeOnly ? "and o.status not in ('delivered', 'cancelled')" : '';
  const { rows } = await client.query(`${SQL} ${where} order by o.created_at desc limit $1`, [limit]);
  return rows.map(toOrder);
}

export async function getOrder(client, id) {
  const { rows } = await client.query(`${SQL} and o.id = $1`, [id]);
  return rows[0] ? toOrder(rows[0]) : null;
}
