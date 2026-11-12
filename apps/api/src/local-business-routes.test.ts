import { strict as assert } from 'node:assert';
import { test } from 'node:test';

process.env.CHIVAGO_DB = ':memory:';
const { app, db } = await import('./server-node.ts');
const { isOpenNow } = await import('./local-business-service.ts');
const parse = async (res: Response): Promise<any> => res.json();
const register = async (suffix: string, accountType: 'operator' | 'traveller') => {
  const res = await app.request('/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    fullName: `Tester ${suffix}`, email: `${suffix}@example.com`, phone: `0810000${suffix.padStart(3, '0')}`,
    password: 'password123', accountType, businessName: accountType === 'operator' ? `Shop ${suffix}` : undefined,
  }) });
  const body = await parse(res);
  assert.equal(res.status, 200, JSON.stringify(body));
  return { 'x-chivago-device-key': body.data.deviceKey };
};
const request = (path: string, method: string, key: Record<string, string>, body?: unknown) =>
  app.request(path, { method, headers: { ...key, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

test('shop ownership, area map feed, review summary, reporting, and deletion', async () => {
  assert.equal(isOpenNow('09:00-18:00', new Date('2026-10-25T04:00:00Z')), true);
  assert.equal(isOpenNow('09:00-18:00', new Date('2026-10-25T14:00:00Z')), false);
  const owner = await register('801', 'operator');
  const other = await register('802', 'operator');
  const traveller = await register('803', 'traveller');
  const input = { name: 'Sichang Cafe', category: 'ร้านอาหาร', areaKey: 'koh-sichang', description: 'Coffee by the pier',
    address: 'Tha Lang', lat: 13.1599, lng: 100.8096, phone: '0811111111', email: 'cafe@example.com',
    openingHours: '09:00-18:00', amenities: ['Wi-Fi'], active: true };
  const forbiddenCreate = await request('/shops', 'POST', traveller, input);
  assert.equal(forbiddenCreate.status, 403);
  const created = await parse(await request('/shops', 'POST', owner, input));
  assert.equal(created.ok, true);
  const id = created.data.id;
  const map = await parse(await request('/shops?area=koh-sichang&search=Cafe', 'GET', traveller));
  assert.deepEqual(map.data.map((s: any) => s.id), [id]);
  assert.equal(map.data[0].rating, null);
  assert.equal(map.data[0].lat, input.lat);
  assert.equal((await parse(await request('/shops?area=samui', 'GET', traveller))).data.length, 0);
  assert.equal((await request(`/shops/${id}`, 'PUT', other, input)).status, 403);
  assert.equal((await request(`/shops/${id}`, 'DELETE', other)).status, 403);
  const hotel = await parse(await request('/shops', 'POST', owner, { ...input, name: 'Sichang Hotel', category: 'ที่พัก' }));
  assert.equal(hotel.ok, true);
  const categoryOrder = await parse(await request('/shops?area=koh-sichang', 'GET', traveller));
  assert.deepEqual(categoryOrder.data.map((shop: any) => shop.category), ['ที่พัก', 'ร้านอาหาร']);
  assert.equal((await request('/shops', 'POST', owner, { ...input, lat: 9.5 })).status, 400);
  assert.equal((await request(`/shops/${id}/reviews/mine`, 'PUT', owner, { rating: 5, body: 'own' })).status, 403);
  assert.equal((await parse(await request(`/shops/${id}/reviews/mine`, 'PUT', traveller, { rating: 4, body: 'Great coffee' }))).ok, true);
  assert.equal((await parse(await request(`/shops/${id}/reviews/mine`, 'PUT', traveller, { rating: 5, body: 'Even better' }))).ok, true);
  const detail = await parse(await request(`/shops/${id}`, 'GET', traveller));
  assert.equal(detail.data.rating, 5);
  assert.equal(detail.data.reviewCount, 1);
  const filtered = await parse(await request('/shops?area=koh-sichang&category=ร้านอาหาร&minRating=4', 'GET', traveller));
  assert.equal(filtered.data.length, 1);
  assert.equal((await request('/shops', 'POST', owner, { ...input, category: 'Cafe' })).status, 400);
  const excluded = await parse(await request('/shops?area=koh-sichang&minRating=5.1', 'GET', traveller));
  assert.equal(excluded.ok, false);
  const photo = new FormData();
  photo.append('photo', new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])], { type: 'image/png' }), 'cover.png');
  const upload = await app.request(`/shops/${id}/images?kind=cover`, { method: 'POST', headers: owner, body: photo });
  const uploaded = await parse(upload);
  assert.equal(uploaded.ok, true);
  const image = await app.request(uploaded.data.url);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal((await parse(await request(`/shops/${id}`, 'GET', traveller))).data.coverUrl, uploaded.data.url);
  const reviews = await parse(await request(`/shops/${id}/reviews`, 'GET', traveller));
  assert.equal(reviews.data.reviews.length, 1);
  assert.equal(reviews.data.reviews[0].mine, true);
  const ownReview = await parse(await request(`/shops/${id}/reviews/mine`, 'GET', traveller));
  assert.equal(ownReview.data.review.body, 'Even better');
  const reviewId = reviews.data.reviews[0].id;
  const reviewPhoto = new FormData();
  reviewPhoto.append('photo', new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])], { type: 'image/png' }), 'review.png');
  const deniedPhoto = await app.request(`/shops/${id}/images?kind=review`, { method: 'POST', headers: other, body: reviewPhoto });
  assert.equal(deniedPhoto.status, 403);
  const ownPhoto = await app.request(`/shops/${id}/images?kind=review`, { method: 'POST', headers: traveller, body: reviewPhoto });
  assert.equal(ownPhoto.status, 200);
  const withPhoto = await parse(await request(`/shops/${id}/reviews`, 'GET', traveller));
  assert.ok(withPhoto.data.reviews[0].photoUrl);
  assert.equal((await request(`/shops/${id}/reviews/${reviewId}/reply`, 'PUT', other, { reply: 'Thanks' })).status, 403);
  assert.equal((await parse(await request(`/shops/${id}/reviews/${reviewId}/reply`, 'PUT', owner, { reply: 'Thanks' }))).ok, true);
  assert.equal((await parse(await request(`/shops/${id}/reviews/${reviewId}/reports`, 'POST', other, { reason: 'Spam' }))).ok, true);
  const deletedReview = await parse(await request(`/shops/${id}/reviews/mine`, 'DELETE', traveller));
  assert.equal(deletedReview.data.deleted, true);
  assert.equal((await parse(await request(`/shops/${id}/reviews/mine`, 'GET', traveller))).data.review, null);
  const afterReview = await parse(await request(`/shops/${id}`, 'GET', owner));
  assert.equal(afterReview.data.reviewCount, 0);
  const removed = await parse(await request(`/shops/${id}`, 'DELETE', owner));
  assert.equal(removed.data.deleted, true);
  assert.equal((await parse(await request(`/shops/${hotel.data.id}`, 'DELETE', owner))).data.deleted, true);
  const afterDelete = await parse(await request('/shops?area=koh-sichang', 'GET', traveller));
  assert.equal(afterDelete.data.length, 0);
});

test('active guides are public without approval; hidden profiles and photos remain owner-only', async () => {
  /*
   * Publication now follows the owner's active flag, independently of the
   * future approval workflow. Check the list, direct profile and photo so
   * hiding a profile also closes access through previously shared URLs.
   */
  const guide = await register('811', 'operator');
  const traveller = await register('812', 'traveller');
  const profile = {
    name: 'Somchai, licensed guide', category: 'ไกด์นำเที่ยว', areaKey: 'samui',
    description: 'Reef trips and the inland waterfalls', address: '', phone: '0812222222',
    email: 'somchai@example.com', openingHours: '', amenities: [], active: true,
    serviceType: 'guide', guideLanguages: ['English', 'ไทย'], guideLineId: 'somchai-line',
  };
  const created = await parse(await request('/shops', 'POST', guide, profile));
  assert.equal(created.ok, true, JSON.stringify(created));
  const id: string = created.data.id;
  assert.equal(created.data.guideStatus, 'not_required', 'approval is not required to publish');

  // A photo, so there is a face to try to fetch.
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, ...new Array(64).fill(0)]);
  const form = new FormData();
  form.set('photo', new File([png], 'face.png', { type: 'image/png' }));
  const uploaded = await parse(await app.request(`/shops/${id}/guide-photo`, { method: 'POST', headers: guide, body: form }));
  assert.equal(uploaded.ok, true, JSON.stringify(uploaded));
  const photoUrl: string = uploaded.data.url;

  const hidden = async (who: Record<string, string>) => {
    const list = await parse(await request('/shops?area=samui', 'GET', who));
    assert.equal(list.data.filter((s: any) => s.id === id).length, 0, 'not in the public list');
    assert.equal((await request(`/shops/${id}`, 'GET', who)).status, 404, 'not by direct id');
    assert.equal((await request(photoUrl, 'GET', who)).status, 404, 'not their face');
  };

  const publicList = await parse(await request('/shops?area=samui', 'GET', traveller));
  assert.equal(publicList.data.filter((s: any) => s.id === id).length, 1);
  assert.equal((await request(`/shops/${id}`, 'GET', traveller)).status, 200);
  assert.equal((await request(photoUrl, 'GET', {})).status, 200, 'active guide photos are public');

  const forbidden = await request(`/shops/${id}`, 'PUT', traveller, { ...profile, active: false });
  assert.equal(forbidden.status, 403, 'another user cannot hide this profile');
  const hide = await parse(await request(`/shops/${id}`, 'PUT', guide, { ...profile, active: false }));
  assert.equal(hide.ok, true, JSON.stringify(hide));
  await hidden(traveller);
  assert.equal((await request(photoUrl, 'GET', {})).status, 404, 'hidden photos are not public');

  // The owner can still edit their hidden profile and see their photo.
  const own = await parse(await request(`/shops/${id}`, 'GET', guide));
  assert.equal(own.data.id, id);
  assert.equal(own.data.guideStatus, 'not_required');
  assert.equal((await request(photoUrl, 'GET', guide)).status, 200, 'the owner can see the photo they uploaded');

  const publish = await parse(await request(`/shops/${id}`, 'PUT', guide, profile));
  assert.equal(publish.ok, true, JSON.stringify(publish));
  const list = await parse(await request('/shops?area=samui', 'GET', traveller));
  assert.equal(list.data.filter((s: any) => s.id === id).length, 1, 'active again, so listed');
  assert.equal((await request(`/shops/${id}`, 'GET', traveller)).status, 200);
  assert.equal((await request(photoUrl, 'GET', {})).status, 200, 'an active guide has a public face');

  // Older pending records follow the same publication rule.
  db.prepare("UPDATE local_shops SET guide_status='pending' WHERE id=?").run(id);
  assert.equal((await request(`/shops/${id}`, 'GET', traveller)).status, 200);

  // A business is not gated: it has no approval step, and `not_required` must
  // not read as "unapproved".
  const shop = await parse(await request('/shops', 'POST', guide, {
    ...profile, name: 'Somchai Rentals', category: 'เช่ารถ', serviceType: 'business',
    lat: 9.5357, lng: 100.0617, address: 'Bophut', openingHours: '09:00-18:00',
  }));
  assert.equal(shop.ok, true, JSON.stringify(shop));
  assert.equal(shop.data.guideStatus, 'not_required');
  const withBusiness = await parse(await request('/shops?area=samui', 'GET', traveller));
  assert.equal(withBusiness.data.filter((s: any) => s.id === shop.data.id).length, 1, 'a business stays public');
});
