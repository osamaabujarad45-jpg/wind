import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFastShip } from './state';

export const palette = {
  paper: '#F8F7F0',
  card: '#FFFFFF',
  ink: '#182D27',
  secondary: '#627269',
  olive: '#34765A',
  olivePale: '#E7F0E8',
  clay: '#CB6845',
  clayPale: '#FAEEE7',
  line: '#DBE3D9',
  muted: '#F0F2EA',
  error: '#A3392A',
};

export const copy = {
  ar: {
    demo: 'نموذج تفاعلي',
    brand: 'فاست شيب',
    home: 'الرئيسية',
    activity: 'طلباتي',
    greeting: 'كل مشوار، إله طريق.',
    homeIntro: 'توصيل أغراض، مشوار، أو نقل حمولة — من مكان واحد وبخطوات واضحة.',
    where: 'وين نقطة الانطلاق؟',
    gpsPrompt: 'حدّد موقعك الحالي لتسهيل الاستلام',
    gpsButton: 'استخدم موقعي',
    gpsLoading: 'جارٍ تحديد الموقع…',
    gpsDenied: 'الموقع غير متاح. يمكنك كتابة معلم قريب عند الحجز.',
    gpsReady: 'تم تحديد موقعك',
    services: 'شو بدك تنقل اليوم؟',
    parcel: 'أغراض وطرود',
    parcelDesc: 'غرض صغير أو طلب من متجر، مع تسليم برمز.',
    ride: 'مشوار بسيارة',
    rideDesc: 'مقعد لك أو لعائلتك بسيارة مرخّصة.',
    freight: 'نقل حمولة',
    freightDesc: 'أثاث، أجهزة، أو حمولة تحتاج مركبة أكبر.',
    choose: 'اطلب الآن',
    recent: 'طلبك التجريبي',
    recentDesc: 'تابع خطوات الطلب وشاهد مسار الخدمة.',
    noRecent: 'عند إنشاء طلب تجريبي سيظهر هنا.',
    promise: 'السعر ظاهر قبل التأكيد · تفاصيل واضحة · دعم عند التعثر',
    back: 'رجوع',
    bookTitle: 'تفاصيل الطلب',
    route: 'المسار',
    pickupCity: 'مدينة الاستلام',
    dropoffCity: 'مدينة الوصول',
    pickupNote: 'معلم قريب من نقطة الاستلام',
    dropoffNote: 'معلم قريب من نقطة التسليم',
    pickupHint: 'مثال: بجانب دوار المنارة',
    dropoffHint: 'مثال: مدخل المستشفى الرئيسي',
    contact: 'رقم تواصل',
    contactHint: '05XXXXXXXX أو +970…',
    details: 'تفاصيل الخدمة',
    parcelDetail: 'شو الغرض؟',
    parcelHint: 'مثال: صندوق ملابس، مغلف جيداً',
    rideDetail: 'ملاحظات للسائق (اختياري)',
    rideHint: 'مثال: معي عربة أطفال',
    freightDetail: 'وصف الحمولة',
    freightHint: 'مثال: غسالة وطاولة، الطابق الثاني',
    parcelSize: 'حجم الغرض',
    loadSize: 'حجم الحمولة',
    small: 'صغير',
    medium: 'متوسط',
    large: 'كبير',
    passengers: 'عدد الركاب',
    loadingHelp: 'مساعدة في التحميل',
    yes: 'نعم',
    no: 'لا',
    payment: 'طريقة الدفع',
    cash: 'نقداً',
    digital: 'دفع إلكتروني',
    quote: 'السعر التجريبي',
    sample: 'للتوضيح فقط؛ لا توجد تعرفة أو سائق مباشر في هذه النسخة.',
    paymentNote: 'ربط الدفع الفعلي متاح بعد التعاقد مع مزوّد مرخّص.',
    confirm: 'أنشئ طلباً تجريبياً',
    required: 'أضف مدينة ومعلمين واضحين ورقم تواصل صالحاً.',
    freightRequired: 'صف الحمولة حتى يمكن اختيار المركبة المناسبة.',
    parcelRequired: 'صف الغرض حتى يمكن اختيار المركبة المناسبة.',
    activityTitle: 'تتبّع الطلب',
    sampleOrder: 'طلب تجريبي',
    mapCaption: 'الموقعان على الخريطة لمعاينة المسار. موقع السائق المباشر يتطلب تشغيل خدمة التوزيع.',
    tracking: 'مراحل الطلب',
    requested: 'تم إنشاء الطلب',
    searching: 'البحث عن مركبة',
    assigned: 'تم قبول الطلب',
    at_pickup: 'وصلت المركبة',
    in_transit: 'في الطريق',
    completed: 'اكتمل الطلب',
    nextDemo: 'انتقل للمرحلة التالية (تجريبي)',
    doneDemo: 'اكتمل العرض التجريبي',
    noOrder: 'لا يوجد طلب بعد',
    noOrderDesc: 'ابدأ من الصفحة الرئيسية لتجربة مسار الحجز.',
    support: 'عند التشغيل الفعلي، يظهر هنا الاتصال والدعم ومشاركة الرحلة.',
    from: 'من',
    to: 'إلى',
    nis: '₪',
  },
  en: {
    demo: 'Interactive prototype',
    brand: 'Fast Ship',
    home: 'Home',
    activity: 'Orders',
    greeting: 'Every trip, one clear route.',
    homeIntro: 'Send an item, book a ride, or move a load in one simple flow.',
    where: 'Where are you starting?',
    gpsPrompt: 'Use your location to simplify pickup',
    gpsButton: 'Use my location',
    gpsLoading: 'Finding your location…',
    gpsDenied: 'Location unavailable. Add a nearby landmark when booking.',
    gpsReady: 'Your location is ready',
    services: 'What are you moving today?',
    parcel: 'Items & parcels',
    parcelDesc: 'A small item or shop order, handed over with a code.',
    ride: 'Passenger ride',
    rideDesc: 'A seat for you or your family in a licensed car.',
    freight: 'Large load',
    freightDesc: 'Furniture, appliances, or a load needing a larger vehicle.',
    choose: 'Book now',
    recent: 'Your demo order',
    recentDesc: 'Explore the order steps and service route.',
    noRecent: 'Your demo order will appear here.',
    promise: 'Price before confirmation · Clear details · Help when delayed',
    back: 'Back',
    bookTitle: 'Request details',
    route: 'Route',
    pickupCity: 'Pickup city',
    dropoffCity: 'Destination city',
    pickupNote: 'Pickup landmark',
    dropoffNote: 'Dropoff landmark',
    pickupHint: 'Example: next to Al-Manara roundabout',
    dropoffHint: 'Example: main hospital entrance',
    contact: 'Contact number',
    contactHint: '05XXXXXXXX or +970…',
    details: 'Service details',
    parcelDetail: 'What is the item?',
    parcelHint: 'Example: well-packed box of clothes',
    rideDetail: 'Notes for driver (optional)',
    rideHint: 'Example: travelling with a stroller',
    freightDetail: 'Describe the load',
    freightHint: 'Example: washer and table, second floor',
    parcelSize: 'Item size',
    loadSize: 'Load size',
    small: 'Small',
    medium: 'Medium',
    large: 'Large',
    passengers: 'Passengers',
    loadingHelp: 'Loading help',
    yes: 'Yes',
    no: 'No',
    payment: 'Payment method',
    cash: 'Cash',
    digital: 'Digital payment',
    quote: 'Sample price',
    sample: 'Illustration only; no live tariff or driver in this build.',
    paymentNote: 'Live payments require a licensed provider integration.',
    confirm: 'Create demo request',
    required: 'Choose cities and add clear landmarks and a valid phone number.',
    freightRequired: 'Describe the load so the right vehicle can be chosen.',
    parcelRequired: 'Describe the item so the right vehicle can be chosen.',
    activityTitle: 'Track request',
    sampleOrder: 'Demo request',
    mapCaption: 'Pins preview the route. Live driver position needs the dispatch service.',
    tracking: 'Order progress',
    requested: 'Request created',
    searching: 'Finding a vehicle',
    assigned: 'Request accepted',
    at_pickup: 'Vehicle at pickup',
    in_transit: 'On the way',
    completed: 'Completed',
    nextDemo: 'Advance demo status',
    doneDemo: 'Demo complete',
    noOrder: 'No request yet',
    noOrderDesc: 'Start on the home screen to try booking.',
    support: 'Contact, support, and trip sharing appear here in the live service.',
    from: 'From',
    to: 'To',
    nis: '₪',
  },
} as const;

export function useCopy() {
  const { language } = useFastShip();
  return { c: copy[language], language, rtl: language === 'ar' };
}

export function PrimaryButton({ title, onPress, muted = false, disabled = false }: {
  title: string; onPress: () => void; muted?: boolean; disabled?: boolean;
}) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={title}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.button, muted && styles.mutedButton, (pressed || disabled) && { opacity: 0.68 }]}
  ><Text style={[styles.buttonText, muted && { color: palette.olive }]}>{title}</Text></Pressable>;
}

export function ScreenTitle({ title }: { title: string }) {
  const { c, rtl } = useCopy();
  return <View style={[styles.titleRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={c.back} onPress={() => router.back()} style={styles.back}>
      <Ionicons name={rtl ? 'arrow-forward' : 'arrow-back'} size={22} color={palette.ink} />
    </Pressable>
    <Text style={[styles.screenTitle, { textAlign: rtl ? 'right' : 'left' }]}>{title}</Text>
  </View>;
}

export function BottomBar({ active }: { active: 'home' | 'activity' }) {
  const { c, rtl } = useCopy();
  const items = [
    { key: 'home', label: c.home, icon: 'home-outline', path: '/' },
    { key: 'activity', label: c.activity, icon: 'receipt-outline', path: '/activity' },
  ] as const;
  return <View style={[styles.bar, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
    {items.map(item => <Pressable key={item.key} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: active === item.key }}
      onPress={() => router.replace(item.path)}
      style={styles.barItem}>
      <Ionicons name={item.icon} size={22} color={active === item.key ? palette.olive : palette.secondary} />
      <Text style={{ color: active === item.key ? palette.olive : palette.secondary, fontSize: 12, fontWeight: '700' }}>{item.label}</Text>
    </Pressable>)}
  </View>;
}

const styles = StyleSheet.create({
  button: { minHeight: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.olive, paddingHorizontal: 20 },
  mutedButton: { backgroundColor: palette.olivePale },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  titleRow: { alignItems: 'center', gap: 14, marginBottom: 22 },
  back: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.line },
  screenTitle: { flex: 1, fontSize: 24, color: palette.ink, fontWeight: '900' },
  bar: { borderTopWidth: 1, borderTopColor: palette.line, backgroundColor: palette.paper, paddingTop: 7, paddingBottom: 5 },
  barItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 54, gap: 3 },
});
