/**
 * User-facing API failures.
 *
 * The server's `error` field is diagnostic copy and may be English, Thai or
 * an internal exception. The stable `code` is the contract. UI code must only
 * render this registry (or its translated generic fallback), never the raw
 * server sentence.
 */
import type { Localised } from '@chivago/core';
import { t } from './locale.ts';

const message = (en: string, th: string, zh: string): Localised => ({ en, th, zh });

export const GENERIC_API_ERROR = message(
  'Something went wrong. Please try again.',
  'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง',
  '出现问题，请重试。',
);

const EXACT: Readonly<Record<string, Localised>> = {
  TIMEOUT: message('The network is slow right now.', 'เครือข่ายช้าอยู่ในขณะนี้', '当前网络较慢。'),
  NETWORK: message('You appear to be offline.', 'ดูเหมือนคุณออฟไลน์อยู่', '你似乎处于离线状态。'),
  UNAUTHENTICATED: message('Sign in to continue.', 'เข้าสู่ระบบเพื่อดำเนินการต่อ', '请登录后继续。'),
  LOGIN_REQUIRED: message('Sign in to continue.', 'เข้าสู่ระบบเพื่อดำเนินการต่อ', '请登录后继续。'),
  OPERATOR_REQUIRED: message('Only business operator accounts can manage services.', 'เฉพาะบัญชีผู้ประกอบการเท่านั้นที่จัดการบริการได้', '只有商家账号才能管理服务。'),
  FORBIDDEN: message('You do not have permission to do that.', 'คุณไม่มีสิทธิ์ดำเนินการนี้', '你没有权限执行此操作。'),
  NOT_YOURS: message('Only the owner can do that.', 'เฉพาะเจ้าของเท่านั้นที่ดำเนินการนี้ได้', '只有所有者可以执行此操作。'),
  NOT_YOUR_REVIEW: message('Only the author can manage this review.', 'เฉพาะผู้เขียนเท่านั้นที่จัดการรีวิวนี้ได้', '只有作者可以管理此评价。'),
  NOT_FOUND: message('The requested item was not found.', 'ไม่พบข้อมูลที่ต้องการ', '未找到所需内容。'),
  UNKNOWN_PLACE: message('This place was not found.', 'ไม่พบสถานที่นี้', '未找到此地点。'),
  NO_SUCH_DEVICE: message('This device was not found on the account.', 'ไม่พบอุปกรณ์นี้ในบัญชี', '未在账户中找到此设备。'),
  EXPIRED: message('This item has expired.', 'รายการนี้หมดอายุแล้ว', '此项目已过期。'),
  UNAVAILABLE: message('This item is not currently available.', 'รายการนี้ยังไม่พร้อมใช้งาน', '此项目当前不可用。'),
  LOCATION_REQUIRED: message('Your location is required for this action.', 'ต้องใช้ตำแหน่งของคุณเพื่อดำเนินการนี้', '此操作需要你的位置。'),
  MOCK_LOCATION: message('Turn off mock location and try again.', 'ปิดตำแหน่งจำลองแล้วลองอีกครั้ง', '请关闭模拟位置后重试。'),
  FIX_TOO_COARSE: message('Your location is not accurate enough. Try again outdoors.', 'ตำแหน่งยังไม่แม่นยำพอ ลองอีกครั้งในที่โล่ง', '定位精度不足，请在室外重试。'),
  IMPOSSIBLE_TRAVEL: message('This journey cannot be verified from the recorded locations.', 'ไม่สามารถยืนยันการเดินทางจากตำแหน่งที่บันทึกไว้ได้', '无法根据记录的位置验证此次行程。'),
  TOO_SOON: message('Please wait a moment and try again.', 'กรุณารอสักครู่แล้วลองอีกครั้ง', '请稍候再试。'),
  TOO_FAR: message('You need to be at the place to check in.', 'คุณต้องอยู่ที่สถานที่จึงจะเช็กอินได้', '请到达该地点后再签到。'),
  TOO_MANY_REGISTRATIONS: message('Too many attempts. Please try again later.', 'มีการลองหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง', '尝试次数过多，请稍后再试。'),
  BAD_REQUEST: message('Check the information and try again.', 'ตรวจสอบข้อมูลแล้วลองอีกครั้ง', '请检查信息后重试。'),
  CODE_REQUIRED: message('Enter the required code.', 'กรุณากรอกรหัสที่จำเป็น', '请输入必填代码。'),
  DECISION_INCOMPLETE: message('Complete the decision before continuing.', 'กรอกผลการพิจารณาให้ครบก่อนดำเนินการต่อ', '请先完成审核决定。'),
  EVENT_TOKEN: message('This event link is invalid or has expired.', 'ลิงก์กิจกรรมไม่ถูกต้องหรือหมดอายุแล้ว', '活动链接无效或已过期。'),
  GUIDE_PROFILE_REQUIRED: message('Complete your guide profile first.', 'กรอกโปรไฟล์ไกด์ให้ครบก่อน', '请先完善向导资料。'),
  HOST_REQUIRED: message('Only the host can do that.', 'เฉพาะผู้จัดเท่านั้นที่ดำเนินการนี้ได้', '只有主办方可以执行此操作。'),
  INVALID_AREA: message('Choose a valid area.', 'กรุณาเลือกพื้นที่ให้ถูกต้อง', '请选择有效区域。'),
  INVALID_BODY: message('Check the submitted information.', 'ตรวจสอบข้อมูลที่ส่งแล้วลองใหม่', '请检查提交的信息。'),
  INVALID_DOCUMENT: message('Choose a valid document.', 'กรุณาเลือกเอกสารที่ถูกต้อง', '请选择有效文件。'),
  INVALID_FILE: message('Choose a valid file.', 'กรุณาเลือกไฟล์ที่ถูกต้อง', '请选择有效文件。'),
  INVALID_INQUIRY: message('Check your enquiry and try again.', 'ตรวจสอบคำสอบถามแล้วลองใหม่', '请检查咨询内容后重试。'),
  INVALID_KIND: message('Choose a valid type.', 'กรุณาเลือกประเภทให้ถูกต้อง', '请选择有效类型。'),
  INVALID_META: message('Check the additional information.', 'ตรวจสอบข้อมูลเพิ่มเติม', '请检查附加信息。'),
  INVALID_NOTE: message('Check the note and try again.', 'ตรวจสอบบันทึกแล้วลองใหม่', '请检查备注后重试。'),
  INVALID_PHOTO: message('Choose a valid photo.', 'กรุณาเลือกรูปภาพที่ถูกต้อง', '请选择有效照片。'),
  INVALID_COMMUNITY_MEDIA: message('Choose a valid photo or video up to 25 MB.', 'เลือกรูปหรือวิดีโอที่ถูกต้อง ขนาดไม่เกิน 25 MB', '请选择不超过 25 MB 的有效照片或视频。'),
  INVALID_COMMUNITY_POST: message('Write something or attach a photo or video.', 'เขียนข้อความหรือแนบรูปหรือวิดีโอก่อนโพสต์', '请输入内容或添加照片或视频。'),
  INVALID_PROFILE: message('Check your profile information.', 'ตรวจสอบข้อมูลโปรไฟล์', '请检查个人资料。'),
  INVALID_PUSH_TOKEN: message('Notifications could not be registered on this device.', 'ไม่สามารถลงทะเบียนการแจ้งเตือนบนอุปกรณ์นี้', '无法在此设备上注册通知。'),
  INVALID_REASON: message('Choose a valid reason.', 'กรุณาเลือกเหตุผลให้ถูกต้อง', '请选择有效原因。'),
  INVALID_TRANSITION: message('This status cannot be changed that way.', 'ไม่สามารถเปลี่ยนสถานะด้วยวิธีนี้', '无法以此方式更改状态。'),
  INVITE_INCOMPLETE: message('Complete the invitation information.', 'กรอกข้อมูลคำเชิญให้ครบ', '请完整填写邀请信息。'),
  LABEL_REQUIRED: message('Enter the required label.', 'กรุณากรอกป้ายชื่อที่จำเป็น', '请输入必填标签。'),
  MULTIPART_REQUIRED: message('Attach the required file and try again.', 'แนบไฟล์ที่จำเป็นแล้วลองใหม่', '请附上必需文件后重试。'),
  NAME_REQUIRED: message('Enter a name.', 'กรุณากรอกชื่อ', '请输入名称。'),
  NO_STATEMENT: message('No statement is available yet.', 'ยังไม่มีรายงาน', '暂无可用声明。'),
  PLACE_REQUIRED: message('Choose a place first.', 'กรุณาเลือกสถานที่ก่อน', '请先选择地点。'),
  REVIEW_REQUIRED: message('Choose a review first.', 'กรุณาเลือกรีวิวก่อน', '请先选择评价。'),
  UNKNOWN_MOOD: message('Choose a supported mood.', 'กรุณาเลือความรู้สึกที่รองรับ', '请选择支持的心情。'),
  VISIT_QUOTA: message('The visit limit has been reached for now.', 'ใช้สิทธิ์การเข้าชมครบจำนวนแล้ว', '目前已达到访问上限。'),
  CONTACT_EXISTS: message('This email or phone number is already in use.', 'อีเมลหรือเบอร์โทรนี้ถูกใช้งานแล้ว', '此邮箱或电话号码已被使用。'),
  EMAIL_EXISTS: message('This email is already in use.', 'อีเมลนี้ถูกใช้งานแล้วในระบบ', '此邮箱已被使用。'),
  INVALID_CREDENTIALS: message('The email, phone number or password is incorrect.', 'อีเมล เบอร์โทรศัพท์ หรือรหัสผ่านไม่ถูกต้อง', '邮箱、电话号码或密码不正确。'),
  PHONE_EXISTS: message('This phone number is already in use.', 'เบอร์โทรศัพท์นี้ถูกใช้งานแล้ว', '此电话号码已被使用。'),
  PASSWORD_TOO_SHORT: message('Use a longer password.', 'รหัสผ่านสั้นเกินไป', '请使用更长的密码。'),
  ACCOUNT_TYPE_MISMATCH: message('Use the sign-in option for this account type.', 'กรุณาเลือกวิธีเข้าสู่ระบบให้ตรงกับประเภทบัญชี', '请使用与此账户类型匹配的登录方式。'),
  INVALID_SHOP: message('Check the service profile and try again.', 'ตรวจสอบโปรไฟล์บริการแล้วลองใหม่', '请检查服务资料后重试。'),
  INVALID_CATEGORY: message('Choose a valid service category.', 'กรุณาเลือกหมวดบริการให้ถูกต้อง', '请选择有效的服务类别。'),
  INVALID_GUIDE_PROFILE: message('Check the guide profile and try again.', 'ตรวจสอบโปรไฟล์ไกด์แล้วลองใหม่', '请检查向导资料后重试。'),
  INVALID_ADDRESS: message('Enter a valid address.', 'กรุณากรอกที่อยู่ให้ถูกต้อง', '请输入有效地址。'),
  INVALID_LOCATION: message('Choose a valid location.', 'กรุณาเลือกตำแหน่งให้ถูกต้อง', '请选择有效位置。'),
  INVALID_GUIDE_HOURS: message('Check the guide availability.', 'ตรวจสอบเวลาว่างของไกด์', '请检查向导可用时间。'),
  INVALID_HOURS: message('Enter valid opening hours.', 'กรุณากรอกเวลาเปิดปิดให้ถูกต้อง', '请输入有效营业时间。'),
  OWN_SHOP: message('You cannot review your own service.', 'คุณไม่สามารถรีวิวบริการของตนเองได้', '你不能评价自己的服务。'),
  INVALID_REVIEW: message('Check the review and try again.', 'ตรวจสอบรีวิวแล้วลองใหม่', '请检查评价后重试。'),
  INVALID_REPLY: message('Check the reply and try again.', 'ตรวจสอบคำตอบแล้วลองใหม่', '请检查回复后重试。'),
  EMAIL_INVALID: message('Enter a valid email address.', 'กรุณากรอกอีเมลให้ถูกต้อง', '请输入有效的邮箱地址。'),
  INVALID_EMAIL: message('Enter a valid email address.', 'กรุณากรอกอีเมลให้ถูกต้อง', '请输入有效的邮箱地址。'),
  PHONE_INVALID: message('Enter a valid phone number.', 'กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง', '请输入有效的电话号码。'),
  INVALID_PHONE: message('Enter a valid phone number.', 'กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง', '请输入有效的电话号码。'),
  NAME_INVALID: message('Enter a valid name.', 'กรุณากรอกชื่อให้ถูกต้อง', '请输入有效的姓名。'),
  INVALID_RATING: message('Choose a rating from 1 to 5.', 'เลือกคะแนนตั้งแต่ 1 ถึง 5', '请选择 1 至 5 分。'),
  PHOTO_REQUIRED: message('Choose a photo first.', 'กรุณาเลือกรูปภาพก่อน', '请先选择照片。'),
  FILE_REQUIRED: message('Choose a file first.', 'กรุณาเลือกไฟล์ก่อน', '请先选择文件。'),
  DOCUMENT_REQUIRED: message('Choose a document first.', 'กรุณาเลือกเอกสารก่อน', '请先选择文件。'),
  FILE_TOO_LARGE: message('The selected file is too large.', 'ไฟล์ที่เลือกมีขนาดใหญ่เกินไป', '所选文件过大。'),
  BODY_TOO_LARGE: message('The submitted content is too large.', 'ข้อมูลที่ส่งมีขนาดใหญ่เกินไป', '提交的内容过大。'),
  STORY_TOO_LARGE: message('This story file is too large.', 'ไฟล์เรื่องราวมีขนาดใหญ่เกินไป', '故事文件过大。'),
  TOO_MANY_PHOTOS: message('Too many photos were selected.', 'เลือกรูปภาพมากเกินไป', '选择的照片过多。'),
  PHOTO_LIMIT: message('The photo limit has been reached.', 'เพิ่มรูปภาพครบจำนวนสูงสุดแล้ว', '已达到照片数量上限。'),
  STORIES_CLOSED: message('Stories are not available here right now.', 'ยังไม่สามารถเพิ่มเรื่องราวที่นี่ได้ในขณะนี้', '此处暂时无法发布故事。'),
  STORY_QUOTA: message('The story limit has been reached for now.', 'เพิ่มเรื่องราวครบจำนวนที่กำหนดแล้ว', '目前已达到故事数量上限。'),
  NOT_ENOUGH_TRIP_POINTS: message(
    'You do not have enough Trip Points yet. They come from exploring.',
    'แต้มทริปยังไม่พอ แต้มทริปได้จากการออกไปเที่ยว',
    '你的旅行积分还不够。旅行积分来自外出探索。',
  ),
  NO_CHARMS: message('You do not have enough charms.', 'คุณมีเครื่องรางไม่เพียงพอ', '你的护符不足。'),
  NOT_ENOUGH_DUST: message('You do not have enough stardust.', 'คุณมีผงดาวไม่เพียงพอ', '你的星尘不足。'),
  ALREADY_HAVE: message('You already have this item.', 'คุณมีรายการนี้แล้ว', '你已经拥有此项目。'),
  ALREADY_REPORTED: message('You have already reported this review.', 'คุณรายงานรีวิวนี้แล้ว', '你已经举报过此评价。'),
  APPEAL_OPEN: message('Your appeal is already being reviewed.', 'คำอุทธรณ์ของคุณกำลังอยู่ระหว่างการตรวจสอบ', '你的申诉正在审核中。'),
  NOTHING_TO_APPEAL: message('There is nothing to appeal for this review.', 'รีวิวนี้ไม่มีรายการที่ต้องอุทธรณ์', '此评价没有可申诉的内容。'),
  APPEAL_TOO_SHORT: message('Add more detail to your appeal.', 'กรุณาเพิ่มรายละเอียดคำอุทธรณ์', '请补充申诉详情。'),
  NO_PARTY: message('You are not currently in a group.', 'ขณะนี้คุณยังไม่ได้อยู่ในกลุ่ม', '你当前不在任何小组中。'),
  NO_ACTIVE_ALERT: message('There is no active alert.', 'ไม่มีการแจ้งเตือนที่กำลังทำงาน', '当前没有活动警报。'),
  UNAVAILABLE_UPLOAD: message('This upload is not supported.', 'ไม่รองรับไฟล์ที่อัปโหลด', '不支持此上传文件。'),
  UNSUPPORTED_UPLOAD: message('This upload is not supported.', 'ไม่รองรับไฟล์ที่อัปโหลด', '不支持此上传文件。'),
  INTERNAL: message('The service had a problem. Please try again.', 'ระบบขัดข้อง กรุณาลองอีกครั้ง', '服务出现问题，请重试。'),
};

const INVALID = message('Check the information and try again.', 'ตรวจสอบข้อมูลแล้วลองอีกครั้ง', '请检查信息后重试。');
const REQUIRED = message('Complete the required information.', 'กรอกข้อมูลที่จำเป็นให้ครบ', '请填写必填信息。');
const CONFLICT = message('This action has already been completed or is no longer available.', 'รายการนี้ดำเนินการแล้วหรือไม่พร้อมใช้งานอีกต่อไป', '此操作已完成或不再可用。');

/** Translate a stable API code. Unknown codes deliberately get safe copy. */
export function apiErrorMessage(code: string | null | undefined): string {
  if (!code) return t(GENERIC_API_ERROR);
  const exact = EXACT[code];
  if (exact) return t(exact);
  if (/^(INVALID|BAD_|UNKNOWN_)/.test(code)) return t(INVALID);
  if (/(REQUIRED|INCOMPLETE)$/.test(code)) return t(REQUIRED);
  if (/^(ALREADY_|NOT_|EXPIRED|UNAVAILABLE)/.test(code)) return t(CONFLICT);
  return t(GENERIC_API_ERROR);
}

export const translatedApiErrorCodes = Object.freeze(Object.keys(EXACT));
