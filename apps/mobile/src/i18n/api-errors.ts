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
  NOT_AVAILABLE: message('This is not available for this area yet.', 'ยังไม่เปิดให้บริการในพื้นที่นี้', '此区域暂不提供。'),
  LOCATION_REQUIRED: message('Your location is required for this action.', 'ต้องใช้ตำแหน่งของคุณเพื่อดำเนินการนี้', '此操作需要你的位置。'),
  MOCK_LOCATION: message('Turn off mock location and try again.', 'ปิดตำแหน่งจำลองแล้วลองอีกครั้ง', '请关闭模拟位置后重试。'),
  FIX_TOO_COARSE: message('Your location is not accurate enough. Try again outdoors.', 'ตำแหน่งยังไม่แม่นยำพอ ลองอีกครั้งในที่โล่ง', '定位精度不足，请在室外重试。'),
  IMPOSSIBLE_TRAVEL: message('This journey cannot be verified from the recorded locations.', 'ไม่สามารถยืนยันการเดินทางจากตำแหน่งที่บันทึกไว้ได้', '无法根据记录的位置验证此次行程。'),
  TOO_SOON: message('Please wait a moment and try again.', 'กรุณารอสักครู่แล้วลองอีกครั้ง', '请稍候再试。'),
  TOO_FAR: message('You need to be at the place to check in.', 'คุณต้องอยู่ที่สถานที่จึงจะเช็กอินได้', '请到达该地点后再签到。'),
  TOO_MANY_REGISTRATIONS: message('Too many attempts. Please try again later.', 'มีการลองหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง', '尝试次数过多，请稍后再试。'),
  BAD_REQUEST: message('Check the information and try again.', 'ตรวจสอบข้อมูลแล้วลองอีกครั้ง', '请检查信息后重试。'),
  // `POST /internal/open-area` with an area key that is not one of ours. An
  // operator's mistake, not a traveller's, but every code the API can answer
  // with needs a sentence here or `test:scripts` fails - and an untranslated
  // code reaches somebody as the raw string.
  BAD_AREA: message('That is not an area this app knows.', 'ไม่ใช่พื้นที่ที่แอพนี้รู้จัก', '这不是本应用识别的区域。'),
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
  QUEST_FULL: message('Every place is taken. Somebody may give one up, so look again later.', 'ที่เต็มแล้ว อาจมีคนสละที่ ลองกลับมาดูอีกครั้ง', '名额已满。可能有人放弃名额，请稍后再看。'),
  QUEST_ENDED: message('This activity is over.', 'กิจกรรมนี้จบแล้ว', '该活动已结束。'),
  QUEST_CLOSED: message('The organiser has closed this activity.', 'ผู้จัดปิดรับกิจกรรมนี้แล้ว', '主办方已关闭该活动。'),
  OUTSIDE_QUEST_HOURS: message('Check-in opens half an hour before the activity and closes when it ends.', 'เช็กอินได้ตั้งแต่ครึ่งชั่วโมงก่อนเริ่มจนถึงเวลาสิ้นสุด', '签到于活动开始前半小时开放，活动结束时关闭。'),
  STUDENT_INVALID: message('Choose a faculty and a year, and agree to how they are used.', 'เลือกคณะและชั้นปี และยอมรับวิธีใช้ข้อมูล', '请选择院系和年级，并同意其使用方式。'),
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
  ACCOUNT_DISABLED: message('This account has been disabled. Contact an administrator.', 'บัญชีนี้ถูกระงับ กรุณาติดต่อผู้ดูแลระบบ', '此账户已被停用，请联系管理员。'),
  INVALID_REWARD: message('Check the reward name and price.', 'ตรวจสอบชื่อและราคาแต้มของรางวัล', '请检查奖励名称和积分价格。'),
  REWARD_LIMIT: message('This shop already has the most rewards it can hold.', 'ร้านนี้มีของรางวัลครบจำนวนสูงสุดแล้ว', '该店铺的奖励数量已达上限。'),
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
  // Debris reports (packages/core/src/debris-report.ts).
  NO_READER: message('Nobody is reading rubbish reports here yet, so this one was not sent.', 'ยังไม่มีผู้รับเรื่องรายงานขยะที่นี่ รายงานนี้จึงยังไม่ได้ส่ง', '这里暂时没有人处理垃圾报告，因此本报告未发送。'),
  TOO_MANY_REPORTS: message('That is the most reports one person can send in an hour. Try again later.', 'ส่งรายงานครบจำนวนสูงสุดต่อชั่วโมงแล้ว ลองใหม่ภายหลัง', '已达到每小时可发送的报告上限，请稍后再试。'),
  INVALID_REPORT: message('Check the answers: how much, and how a person gets to it.', 'ตรวจคำตอบอีกครั้ง: มากแค่ไหน และคนจะเข้าไปถึงยังไง', '请检查回答：数量，以及人要怎么过去。'),
  // The desk's own refusals (debris-desk-service.ts). They are answered on the
  // console page, but every backend code has its words here too.
  NOT_OPEN: message('This case has already been decided.', 'เคสนี้ตัดสินไปแล้ว', '此案件已有决定。'),
  WEIGHT_REQUIRED: message('Weigh it first: the weight in kilograms, as the scale read.', 'ชั่งก่อน ใส่น้ำหนักเป็นกิโลกรัมตามที่ตาชั่งอ่านได้', '请先称重：填写秤上读数（公斤）。'),
  OUTCOME_REQUIRED: message('Say what is left on the sand: nothing, or how much.', 'ระบุว่าเหลืออะไรบนหาด ไม่เหลือ หรือเหลือมากแค่ไหน', '请说明沙滩上还剩什么：没有，或剩多少。'),
  LEFT_REQUIRED: message('Say how much is left, so the rest goes back on the queue.', 'ระบุว่าเหลือมากแค่ไหน ส่วนที่เหลือจะกลับเข้าคิว', '请说明剩余多少，以便重新排队。'),
  PHOTO_LIMIT: message('The photo limit has been reached.', 'เพิ่มรูปภาพครบจำนวนสูงสุดแล้ว', '已达到照片数量上限。'),
  STORIES_CLOSED: message('Stories are not available here right now.', 'ยังไม่สามารถเพิ่มเรื่องราวที่นี่ได้ในขณะนี้', '此处暂时无法发布故事。'),
  STORY_QUOTA: message('The story limit has been reached for now.', 'เพิ่มเรื่องราวครบจำนวนที่กำหนดแล้ว', '目前已达到故事数量上限。'),
  NOT_ENOUGH_TRIP_POINTS: message(
    'You do not have enough Trip Points yet. They come from exploring.',
    'แต้มทริปยังไม่พอ แต้มทริปได้จากการออกไปเที่ยว',
    '你的旅行积分还不够。旅行积分来自外出探索。',
  ),
  DAILY_PULL_LIMIT: message(
    'All pulls for today are used. The box opens again at midnight.',
    'วันนี้สุ่มครบจำนวนแล้ว ตู้จะเปิดอีกครั้งตอนเที่ยงคืน',
    '今天的抽取次数已用完，午夜后再来。',
  ),
  NO_CHARMS: message('You do not have enough charms.', 'คุณมีเครื่องรางไม่เพียงพอ', '你的护符不足。'),
  NOT_ENOUGH_DUST: message('You do not have enough stardust.', 'คุณมีผงดาวไม่เพียงพอ', '你的星尘不足。'),
  NO_ELIGIBLE_REWARDS: message('There is nothing left to win in this banner right now.', 'ตู้นี้ไม่มีรางวัลให้สุ่มในตอนนี้', '这个卡池目前没有可抽取的奖励。'),
  INVALID_REWARD_POOL: message('The prize box is being fixed. Please try again later.', 'ตู้สุ่มกำลังปรับปรุง ลองใหม่ภายหลังนะ', '奖池正在维护，请稍后再试。'),
  IDEMPOTENCY_CONFLICT: message('That pull was already sent differently. Please try again.', 'การสุ่มนี้ถูกส่งไปแล้วในแบบอื่น ลองใหม่อีกครั้ง', '这次抽取已以不同方式提交，请重试。'),
  ALREADY_HAVE: message('You already have this item.', 'คุณมีรายการนี้แล้ว', '你已经拥有此项目。'),
  ALREADY_REPORTED: message('You have already reported this review.', 'คุณรายงานรีวิวนี้แล้ว', '你已经举报过此评价。'),
  APPEAL_OPEN: message('Your appeal is already being reviewed.', 'คำอุทธรณ์ของคุณกำลังอยู่ระหว่างการตรวจสอบ', '你的申诉正在审核中。'),
  NOTHING_TO_APPEAL: message('There is nothing to appeal for this review.', 'รีวิวนี้ไม่มีรายการที่ต้องอุทธรณ์', '此评价没有可申诉的内容。'),
  APPEAL_TOO_SHORT: message('Add more detail to your appeal.', 'กรุณาเพิ่มรายละเอียดคำอุทธรณ์', '请补充申诉详情。'),
  NO_PARTY: message('You are not currently in a group.', 'ขณะนี้คุณยังไม่ได้อยู่ในกลุ่ม', '你当前不在任何小组中。'),
  NO_ACTIVE_ALERT: message('There is no active alert.', 'ไม่มีการแจ้งเตือนที่กำลังทำงาน', '当前没有活动警报。'),
  UNAVAILABLE_UPLOAD: message('This upload is not supported.', 'ไม่รองรับไฟล์ที่อัปโหลด', '不支持此上传文件。'),
  UNSUPPORTED_UPLOAD: message('This upload is not supported.', 'ไม่รองรับไฟล์ที่อัปโหลด', '不支持此上传文件。'),
  // The migration route (docs/71). These reach an operator moving a database
  // between deployments, never a traveller - but the contract is that every
  // code the API can return has copy here, because the alternative is an
  // operator reading GENERIC_API_ERROR while a migration sits half-done.
  WEAK_IMPORT_TOKEN: message('This deployment cannot accept an import: its token is too short.', 'ปลายทางนี้รับข้อมูลเข้าไม่ได้ เพราะโทเคนสั้นเกินไป', '此部署无法接收导入：令牌太短。'),
  DATABASE_NOT_EMPTY: message('The database already holds data, so the import was refused.', 'ฐานข้อมูลปลายทางมีข้อมูลอยู่แล้ว จึงปฏิเสธการนำเข้า', '目标数据库已有数据，导入已被拒绝。'),
  BAD_BATCH: message('This import batch is malformed.', 'ชุดข้อมูลที่ส่งมาไม่ถูกรูปแบบ', '此导入批次格式不正确。'),
  IMPORT_FAILED: message('The import did not finish.', 'การนำเข้าไม่สำเร็จ', '导入未完成。'),
  // Both halves share this one: a batch too big to post in is also a page too
  // big to read out, and it is the same ceiling and the same fix (fewer rows).
  BATCH_TOO_LARGE: message('This batch is too large. Use fewer rows.', 'ชุดข้อมูลนี้ใหญ่เกินไป ลองลดจำนวนแถว', '此批次过大，请减少行数。'),
  // The export route (docs/71, the backup half). Operator-facing like the
  // import codes above, and here for the same reason: an operator taking a
  // backup must read what went wrong, not GENERIC_API_ERROR.
  WEAK_EXPORT_TOKEN: message('This deployment cannot be exported: its token is too short.', 'ปลายทางนี้ส่งข้อมูลออกไม่ได้ เพราะโทเคนสั้นเกินไป', '此部署无法导出：令牌太短。'),
  BAD_EXPORT_REQUEST: message('That export request is not one this database answers.', 'คำขอส่งออกนี้ไม่ถูกต้อง', '此导出请求无效。'),
  // Chivar Bot's two ceilings (docs/75). Neither is the traveller's mistake,
  // and without an entry here both fall through to GENERIC_API_ERROR - which
  // tells somebody who sent one message too many to try again, the single
  // thing that cannot work until the minute is out.
  RATE_LIMITED: message(
    'Chivar Bot has had too many messages. Try again in a minute.',
    'Chivar Bot ได้รับข้อความมากเกินไป ลองอีกครั้งในอีกหนึ่งนาที',
    'Chivar Bot 收到的消息过多，请一分钟后再试。',
  ),
  CONVERSATION_LIMIT: message(
    'Too many conversations are open. Continue an existing one, or wait for the old history to expire.',
    'มีบทสนทนาเปิดอยู่มากเกินไป คุยต่อในบทสนทนาเดิม หรือรอให้ประวัติเก่าหมดอายุ',
    '打开的会话过多。请继续已有会话，或等待旧记录过期。',
  ),
  /*
    THE PARTY AND QUEST CODES, which arrived with #264 and had no entries.

    `apiErrorMessage` falls back to the generic line when a code is missing,
    and the generic line says to try again - which for IMAGE_TOO_LARGE or
    NOT_MEMBER is the one thing that cannot work. The same gap shipped on
    15 November with RATE_LIMITED and CONVERSATION_LIMIT; it is a test now,
    and this is that test being paid.

    Each of these says what happened and what the reader can do about it,
    because "something went wrong" is not worth three translations.
  */
  NOT_OWNER: message(
    'Only the party owner can do that.',
    'เฉพาะหัวหน้ากลุ่มเท่านั้นที่ทำสิ่งนี้ได้',
    '只有队长可以执行此操作。',
  ),
  OWNER_ONLY: message(
    'Only the party owner can change this.',
    'เฉพาะหัวหน้ากลุ่มเท่านั้นที่เปลี่ยนสิ่งนี้ได้',
    '只有队长可以更改此设置。',
  ),
  NOT_MEMBER: message(
    'You are not in this party.',
    'คุณไม่ได้อยู่ในกลุ่มนี้',
    '你不在这个队伍中。',
  ),
  MEMBER_REQUIRED: message(
    'Join the party before doing that.',
    'เข้าร่วมกลุ่มก่อนจึงจะทำสิ่งนี้ได้',
    '请先加入队伍再进行此操作。',
  ),
  EMPTY_PARTY: message(
    'This party has nobody in it yet.',
    'ยังไม่มีใครอยู่ในกลุ่มนี้',
    '这个队伍还没有成员。',
  ),
  PARTY_NOT_AVAILABLE: message(
    'This party is not open just now.',
    'กลุ่มนี้ยังไม่เปิดให้เข้าร่วมตอนนี้',
    '该队伍目前未开放。',
  ),
  OWNER_TRANSFER_REQUIRED: message(
    'Hand the party to somebody else before you leave.',
    'ส่งต่อหัวหน้ากลุ่มให้คนอื่นก่อนออกจากกลุ่ม',
    '离开前请先将队长转交给其他人。',
  ),
  TRANSFER_TARGET_INVALID: message(
    'That person cannot take over the party.',
    'ส่งต่อหัวหน้ากลุ่มให้คนนี้ไม่ได้',
    '无法将队长转交给此人。',
  ),
  INVALID_IMAGE: message(
    'That file is not an image the app can read.',
    'ไฟล์นี้ไม่ใช่รูปภาพที่แอปอ่านได้',
    '该文件不是应用可读取的图片。',
  ),
  IMAGE_TOO_LARGE: message(
    'That picture is too large. Choose a smaller one.',
    'รูปนี้ใหญ่เกินไป เลือกรูปที่เล็กกว่านี้',
    '图片过大，请选择较小的图片。',
  ),
  PHOTO_NOT_FOUND: message(
    'That photograph is no longer there.',
    'ไม่พบรูปภาพนี้แล้ว',
    '该照片已不存在。',
  ),
  SHARING_DISABLED: message(
    'Sharing is turned off for this party.',
    'กลุ่มนี้ปิดการแชร์ไว้',
    '该队伍已关闭分享功能。',
  ),
  INVALID_SHARING: message(
    'That sharing setting is not one the app offers.',
    'การตั้งค่าการแชร์นี้ไม่ถูกต้อง',
    '该分享设置无效。',
  ),
  LOCATION_RATE_LIMIT: message(
    'Your position is being sent too often. It will catch up shortly.',
    'ส่งตำแหน่งถี่เกินไป เดี๋ยวระบบจะตามให้ทัน',
    '位置发送过于频繁，稍后会自动跟上。',
  ),
  MESSAGE_REQUIRED: message(
    'Write something before sending.',
    'พิมพ์ข้อความก่อนส่ง',
    '发送前请先输入内容。',
  ),
  INVALID_PING: message(
    'That ping is not one the app can send.',
    'สัญญาณนี้ส่งไม่ได้',
    '无法发送该提示。',
  ),
  PLACE_ALREADY_ADDED: message(
    'That place is already on the party list.',
    'สถานที่นี้อยู่ในรายการของกลุ่มแล้ว',
    '该地点已在队伍列表中。',
  ),
  QUEST_REQUIRED: message(
    'Choose a quest first.',
    'เลือกเควสต์ก่อน',
    '请先选择任务。',
  ),
  QUEST_NOT_FOUND: message(
    'That quest is not available any more.',
    'ไม่พบเควสต์นี้แล้ว',
    '该任务已不存在。',
  ),
  PARTY_QUEST_NOT_FOUND: message(
    'This party is not on that quest.',
    'กลุ่มนี้ไม่ได้ทำเควสต์นั้นอยู่',
    '该队伍未进行此任务。',
  ),
  PARTY_QUEST_ACTIVE: message(
    'This party is already on a quest. Finish it first.',
    'กลุ่มนี้มีเควสต์ที่ทำอยู่แล้ว ทำให้เสร็จก่อน',
    '该队伍已有进行中的任务，请先完成。',
  ),
  INVALID_QUEST_TYPE: message(
    'That kind of quest cannot be started here.',
    'เควสต์ประเภทนี้เริ่มที่นี่ไม่ได้',
    '此类型的任务无法在此开始。',
  ),
  INVALID_QUEST_MODE: message(
    'That way of running the quest is not available.',
    'โหมดของเควสต์นี้ใช้ไม่ได้',
    '该任务模式不可用。',
  ),
  INVALID_QUEST_STATE: message(
    'The quest has moved on. Open it again to see where it stands.',
    'สถานะเควสต์เปลี่ยนไปแล้ว เปิดดูอีกครั้งเพื่อดูสถานะล่าสุด',
    '任务状态已改变，请重新打开查看。',
  ),
  END_FAILED: message(
    'The quest could not be closed. Try again.',
    'ปิดเควสต์ไม่สำเร็จ ลองอีกครั้ง',
    '无法结束任务，请重试。',
  ),

  // Adventure verification, progression, trips and seasons. These codes are
  // stable server contracts; never surface the server's diagnostic sentence.
  NODE_NOT_FOUND: message('This adventure stop was not found.', 'ไม่พบจุดผจญภัยนี้', '未找到此冒险地点。'),
  BAD_GEOFENCE: message('This location boundary is not configured correctly.', 'ขอบเขตสถานที่นี้ตั้งค่าไม่ถูกต้อง', '此地点范围配置不正确。'),
  QR_INVALID: message('This QR code is not a ChivaGo activity code.', 'QR นี้ไม่ใช่รหัสกิจกรรมของ ChivaGo', '此二维码不是 ChivaGo 活动码。'),
  QR_SIGNATURE_INVALID: message('This QR code could not be verified.', 'ไม่สามารถตรวจสอบลายเซ็นของ QR นี้ได้', '无法验证此二维码的签名。'),
  QR_PAYLOAD_INVALID: message('This QR code is incomplete or damaged.', 'ข้อมูลใน QR นี้ไม่ครบหรือเสียหาย', '此二维码内容不完整或已损坏。'),
  QR_SECRET_UNSAFE: message('QR verification is not safely configured.', 'ระบบตรวจสอบ QR ยังตั้งค่าไม่ปลอดภัย', '二维码验证尚未安全配置。'),
  NODE_LOCKED: message('Complete the earlier adventure stop first.', 'ทำจุดผจญภัยก่อนหน้าให้เสร็จก่อน', '请先完成前一个冒险地点。'),
  OUTSIDE_GEOFENCE: message('Move closer to the activity location and try again.', 'เข้าใกล้จุดกิจกรรมแล้วลองอีกครั้ง', '请靠近活动地点后重试。'),
  EVIDENCE_NOT_FOUND: message('This evidence submission was not found.', 'ไม่พบหลักฐานที่ส่งนี้', '未找到此证据提交。'),
  EVIDENCE_NOT_DRAFT: message('This evidence has already been submitted.', 'หลักฐานนี้ถูกส่งแล้ว', '此证据已提交。'),
  QR_MISMATCH: message('This QR code belongs to a different location.', 'QR นี้เป็นของสถานที่อื่น', '此二维码属于其他地点。'),
  QR_ACTIVITY_MISMATCH: message('This QR code is for a different activity.', 'QR นี้ใช้กับกิจกรรมอื่น', '此二维码用于其他活动。'),
  QR_REVOKED: message('This QR code has been withdrawn.', 'QR นี้ถูกเพิกถอนแล้ว', '此二维码已被撤销。'),
  QR_EXPIRED: message('This QR code has expired. Ask for a new one.', 'QR นี้หมดอายุแล้ว กรุณาขอรหัสใหม่', '此二维码已过期，请获取新码。'),
  QR_REPLAYED: message('This one-time QR code has already been used.', 'QR แบบใช้ครั้งเดียวนี้ถูกใช้แล้ว', '此一次性二维码已使用。'),
  QR_NOT_ALLOWED: message('This QR code cannot verify this activity.', 'QR นี้ใช้ยืนยันกิจกรรมนี้ไม่ได้', '此二维码无法验证该活动。'),
  EVIDENCE_NOT_REQUIRED: message('This activity does not accept photo evidence.', 'กิจกรรมนี้ไม่รับหลักฐานภาพถ่าย', '此活动不接受照片证据。'),
  QR_REQUIRED: message('Scan the activity QR code before continuing.', 'สแกน QR ของกิจกรรมก่อนดำเนินการต่อ', '请先扫描活动二维码。'),
  CANNOT_CANCEL: message('This submission can no longer be cancelled.', 'ยกเลิกการส่งนี้ไม่ได้แล้ว', '此提交已无法取消。'),
  ALREADY_DECIDED: message('This evidence has already been reviewed.', 'หลักฐานนี้ได้รับการพิจารณาแล้ว', '此证据已审核。'),
  REASON_REQUIRED: message('Enter a reason before rejecting.', 'ระบุเหตุผลก่อนปฏิเสธ', '拒绝前请输入原因。'),
  EVIDENCE_PENDING: message('Your evidence is still awaiting review.', 'หลักฐานกำลังรอการตรวจสอบ', '你的证据仍在等待审核。'),
  ASSIGNMENT_INVALID: message('Enter an assignment between 1 and 120 characters.', 'กรอกงานที่มอบหมายความยาว 1–120 ตัวอักษร', '请输入 1 至 120 个字符的任务。'),
  PARTICIPANT_NOT_FOUND: message('That traveller is not in this quest roster.', 'ไม่พบผู้เดินทางคนนี้ในรายชื่อภารกิจ', '该旅行者不在此任务名单中。'),
  PARTY_QUEST_EXPIRED: message('This party quest has ended.', 'ภารกิจปาร์ตี้นี้หมดเวลาแล้ว', '此队伍任务已结束。'),
  PARTY_QUEST_INCOMPLETE: message('The party still has work to complete.', 'ปาร์ตี้ยังมีงานที่ต้องทำให้เสร็จ', '队伍仍有任务尚未完成。'),
  PET_NOT_FOUND: message('This companion was not found.', 'ไม่พบเพื่อนร่วมเดินทางตัวนี้', '未找到此伙伴。'),
  GESTURE_INVALID: message('Choose a supported pet gesture.', 'เลือกท่าทางสัตว์เลี้ยงที่รองรับ', '请选择支持的宠物动作。'),
  GESTURE_LOCKED: message('Build more bond to unlock this gesture.', 'เพิ่มความผูกพันเพื่อปลดล็อกท่านี้', '提升亲密度以解锁此动作。'),
  SEASON_INVALID: message('Check the season settings and try again.', 'ตรวจสอบการตั้งค่าฤดูกาลแล้วลองใหม่', '请检查赛季设置后重试。'),
  SEASON_NOT_FOUND: message('This season was not found.', 'ไม่พบฤดูกาลนี้', '未找到此赛季。'),
  ITEM_NOT_FOUND: message('This collection item was not found.', 'ไม่พบของสะสมนี้', '未找到此收藏品。'),
  CATCH_UP_UNAVAILABLE: message('Catch-up exchange is not available for this season.', 'ฤดูกาลนี้ยังไม่เปิดแลกของย้อนหลัง', '此赛季暂不支持补领奖励兑换。'),
  ITEM_ALREADY_OWNED: message('You already own this collection item.', 'คุณมีของสะสมนี้แล้ว', '你已拥有此收藏品。'),
  MEMORY_COINS_INSUFFICIENT: message('You do not have enough Memory Coins.', 'เหรียญความทรงจำไม่เพียงพอ', '记忆币不足。'),
  SEASON_INCOMPLETE: message('Complete the required season progress first.', 'ทำความคืบหน้าฤดูกาลให้ครบก่อน', '请先完成所需赛季进度。'),
  REQUEST_ID_REQUIRED: message('This request needs a new request ID.', 'คำขอนี้ต้องมีรหัสคำขอใหม่', '此请求需要新的请求 ID。'),
  QR_NOT_CONFIGURED: message('No QR code is configured for this activity.', 'กิจกรรมนี้ยังไม่ได้ตั้งค่า QR', '此活动尚未配置二维码。'),
  JOURNAL_CONFLICT: message('This journal changed on another device. Reload before saving.', 'สมุดทริปถูกแก้จากอุปกรณ์อื่น โหลดใหม่ก่อนบันทึก', '旅行日志已在其他设备更改，请重新加载后保存。'),
  HOST_SECRET_UNSAFE: message('Host verification is not safely configured.', 'ระบบยืนยันของผู้ดูแลยังตั้งค่าไม่ปลอดภัย', '主办方验证尚未安全配置。'),
  PROOF_NOT_FOUND: message('This proof was not found.', 'ไม่พบหลักฐานนี้', '未找到此证明。'),
  PROOF_MISMATCH: message('This proof does not belong to this traveller or quest.', 'หลักฐานนี้ไม่ตรงกับผู้เดินทางหรือภารกิจ', '此证明与旅行者或任务不匹配。'),
  TRIP_NOT_FOUND: message('This trip was not found.', 'ไม่พบทริปนี้', '未找到此行程。'),
  TRIP_NAME_INVALID: message('Enter a trip name between 1 and 80 characters.', 'กรอกชื่อทริปความยาว 1–80 ตัวอักษร', '请输入 1 至 80 个字符的行程名称。'),
  TRIP_ENTRIES_INVALID: message('Choose valid journal entries for this trip.', 'เลือกรายการสมุดทริปให้ถูกต้อง', '请选择有效的旅行日志条目。'),
  TRIP_ENTRY_FORBIDDEN: message('You can only add your own journal entries.', 'เพิ่มได้เฉพาะรายการสมุดทริปของคุณ', '你只能添加自己的旅行日志条目。'),
  TRIP_ENTRY_ASSIGNED: message('One of these journal entries is already in another trip.', 'มีรายการสมุดทริปที่อยู่ในทริปอื่นแล้ว', '其中一条旅行日志已属于其他行程。'),
  TRIP_VISIBILITY_INVALID: message('Choose a valid trip privacy setting.', 'เลือกการมองเห็นทริปให้ถูกต้อง', '请选择有效的行程隐私设置。'),
  TRIP_COVER_INVALID: message('Choose a valid trip cover photo.', 'เลือกภาพหน้าปกทริปให้ถูกต้อง', '请选择有效的行程封面照片。'),
  TRIP_COVER_FORBIDDEN: message('You can only use your own trip photo as the cover.', 'ใช้ได้เฉพาะรูปทริปของคุณเป็นหน้าปก', '只能使用你自己的行程照片作为封面。'),
  INTERNAL: message('The service had a problem. Please try again.', 'ระบบขัดข้อง กรุณาลองอีกครั้ง', '服务出现问题，请重试。'),

  /*
    CODES NO PHONE IS MEANT TO SEE.

    `POST /integrations/sentiara/incident` answers a camera's bridge, not a
    traveller, so nothing in the app renders these today. They are here because
    the registry is the one place that lists every code the backend can return,
    and `scripts/api-error-contract.test.mjs` holds that line: a code without a
    row fails the build rather than reaching somebody as English, or as the
    generic sentence that explains nothing.

    So the copy is written for the case that is not supposed to happen - a
    person somehow seeing one - and says what occurred without inventing a
    cause or an instruction they cannot act on.
  */
  UNAUTHORIZED: message('This request was not accepted.', 'คำขอนี้ไม่ได้รับการยอมรับ', '此请求未被接受。'),
  INCIDENT_ALREADY_STORED: message('This report is already on file.', 'รายงานนี้ถูกบันทึกไว้แล้ว', '此报告已存档。'),
  FORBIDDEN_INCIDENT_KIND: message('This kind of report is not accepted.', 'ไม่รับรายงานประเภทนี้', '不接受此类报告。'),
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
