# Careem Captain — earnings statement and cash/payout atlas

**Artifact:** `com.careem.adma` v89.70.2, base APK `com_careem_adma__base.apk` (157.33 MB).  
**Extends:** `research_notes/REA-2026-11-13-reference-apps/CAREEM.md` §10.1–10.2. This note supplies the complete resource-key sets, exact bilingual copy, multiline strings, payout constraints, and the distinction between cash-job blocking and whole-account blocking.  
**Evidence labels:** **[obs]** is text present in the APK; **[inf]** is an interpretation of that text; **[unk]** is not established by the artifact. All mechanism statements below are **[inf] from copy**, never observed runtime or server behaviour.

## Extraction and scope

- **[obs]** Ran `aapt2 dump resources` with build-tools 36.1.0. Python `subprocess` captured stdout as bytes (`6,116,682` bytes) and decoded it as UTF-8 before parsing; PowerShell did not transcode the output.
- **[obs]** Parser: a resource-chunk/state parser isolated the `type string` block, split on four-space `resource … string/<key>` headers and six-space locale markers, and treated all following lines through the next marker as one multiline value. It mapped `()` to English and `(ar)` to Arabic, removed only aapt2's outer quoting/style metadata, and unescaped quoted text. This preserves strings that a single-line parser truncates.
- **[obs]** The block header declares `entryCount=9762`; the parser returned **9,762 entries / 9,762 unique keys**, all with a default value. **9,128** entries have an `(ar)` configuration. The complete `breakdown_` prefix has **14** keys; §10.1's shorter selection omitted `breakdown_title`, `breakdown_cta`, and the financially important `breakdown_trip_earnings`.
- **[obs]** The keyword sweep covered keys and English/Arabic values for balance, negative balance, outstanding/debt/settlement, transfer/payout/withdrawal, cash blocking, and limits. The tables include captain-specific copy plus shared wallet/cashout copy that directly describes a possible payout route. Consumer P2P, remittance-recipient, bill-payment, and unrelated UI limits are excluded rather than misattributed to captain settlement.
- **[obs]** Placeholders, punctuation, and translation errors are retained. `<br>` represents an embedded newline in a resource. `—` means no `(ar)` value in this build.

---

## Area 1 — the earnings statement

### Complete `breakdown_*` set

The English and Arabic columns are **[obs]**. The final column is explicitly **[inf] from the wording**, not a sign read from code or a ledger value.

| Key | English [obs] | Arabic [obs] | Pay direction [inf] |
|---|---|---|---|
| `breakdown_behavior_penalties` | Behavior penalties | عقوبات السلوك | **Deduction** — a penalty charged to the captain. |
| `breakdown_bonus` | Bonus | مكافآة | **Addition** — supplemental pay. |
| `breakdown_cta` | View all bookings | عرض جميع الحجوزات | **Not a money line** — drill-down action. |
| `breakdown_fines` | Fines | الغرامات | **Deduction** — a charged fine. |
| `breakdown_fines_refund` | Fines refund | استرداد الغرامات | **Addition / deduction reversal** — money returned after a fine. |
| `breakdown_guarantees` | Guarantees | الضمانات | **Addition** — reads as guarantee support paid to the captain; the guarantee formula is not stated. |
| `breakdown_matched_tips` | Ramadan tips from Careem | — | **Addition** — a Careem-funded/matched tip; “matched” is in the key, while the visible English only says “tips from Careem.” |
| `breakdown_money_in` | Money in | المال الداخل | **Credit/addition side** — a directional bucket, not necessarily earnings itself. |
| `breakdown_money_out` | Money out | المال الخارج | **Debit/deduction side** — a directional bucket, not necessarily a penalty. |
| `breakdown_other` | Other | أخرى | **Sign unresolved** — an unclassified bucket. |
| `breakdown_subtitle` | Understand your earnings | افهم أرباحك | **Not a money line** — explanatory subtitle. |
| `breakdown_tips` | Tips | إكراميات | **Addition** — gratuities. |
| `breakdown_title` | Breakdown | تحليل مفصّل | **Not a money line** — section title. |
| `breakdown_trip_earnings` | Trip earnings | أرباح الرحلة | **Addition** — the base trip-earnings component missing from §10.1's table. |

### Adjacent earnings copy that changes the reading

| Key | English [obs] | Arabic [obs] |
|---|---|---|
| `dialog_split_earnings_title` | You get to keep 100% of your earnings | تحصل على 100% من أرباحك |
| `dialog_split_earnings_description` | We settle your supplier fees directly, so now what you see is what you keep. | نقوم بتسوية رسوم الموردين مباشرة، لذا ما تراه الآن هو ما تحتفظ به. |
| `earning_banner_title` | You keep 100% of your earnings | تحتفظ بـ 100% من أرباحك |
| `earning_banner_subtitle` | Supplier fee will be settled directly | سيتم تسوية رسوم المورد مباشرةً |

### What the statement accounts for

- **[inf]** The statement is more than the previously noted incentive/penalty list. Its financial vocabulary covers **base trip earnings**, **tips**, **Careem-provided Ramadan tips**, **bonuses**, **guarantee support**, **fines**, **behaviour penalties**, **fine reversals**, generic **money-in/money-out** movements, and an **unclassified “Other” bucket**. “View all bookings” supplies a booking-level drill-down label.
- **[inf]** “Money in” and “money out” read as ledger directions, while the named earning/fine lines read as explanatory categories. The copy alone does not establish whether these are two levels of one statement, alternative groupings, or different screens.
- **[obs]** There is no `breakdown_commission`, `breakdown_supplier_fee`, `breakdown_tax`, or `breakdown_net_payout` key in the complete 14-key prefix.
- **[inf]** The adjacent “100%” and “supplier fees settled directly” copy could explain why supplier fees are not a visible deduction line: the displayed amount may already be net of a fee settled elsewhere. That is a reading of marketing/UI copy, **not proof of a zero take rate**, and not proof that this wording applies to every service, captain, or market.
- **[unk]** Amounts, signs in real statements, guarantee eligibility/formula, fine policy, tax treatment, supplier-fee calculation, and whether matched tips are a recurring feature are all absent.

---

## Area 2 — cash debt, blocking, settlement, and payout

### A. Balance and no-debt states [obs]

| Key | English | Arabic |
|---|---|---|
| `balance_add_payment_method` | Add your payment method to receive your payments | أضف طريقة الدفع الخاصة بك لتلقي مدفوعاتك |
| `balance_card_positive_title` | Available to transfer | متاح للتحويل |
| `balance_card_negative_title` | Negative balance | رصيد سالب |
| `balance_card_zero_title` | Current balance | الرصيد الحالي |
| `balance_chip_text` | Balance: %s | الرصيد: %s |
| `balance_cta_to_payment_methods` | Transfer options | خيارات التحويل |
| `balance_landing_today` | Today | اليوم |
| `balance_payback_button_title` | Pay back Careem | سدّد لكريم |
| `balance_payback_later` | Pay back later | سدّد لاحقًا |
| `balance_payout_date_text` | Auto transfer on %s | التحويل التلقائي في %s |
| `balance_title` | Balance | الرصيد |
| `balance_transfer_button_title` | Transfer now | حوّل الآن |
| `captain_cash_balance_text` | Captain cash balance | رصيد الكابتن النقدي |
| `pay_captain_cash_balance_title` | Captain Cash Balance | رصيد الكابتن النقدي |
| `pay_own_transfer_captain_cash_balance_title` | Cash (Captain’s Balance) | نقد (رصيد حساب الكابتن) |
| `go_to_captain_portal` | Go to Captain Portal to check your current balance | اذهب إلى بوابة الكابتن للتحقق من رصيدك الحالي |
| `load_earning_error` | Error loading captain cash balance | خطأ في تحميل رصيد الكابتن النقدي |
| `no_outstanding_balance` | No outstanding cash balance | لا يوجد عليك مبالغ غير مسددة |
| `no_outstanding_dialog_text` | You don’t owe us any cash at the moment. You can accept all types of bookings. | لا تدين لنا بأي مبالغ نقدية في الوقت الحالي. يمكنك قبول جميع أنواع الحجوزات. |
| `accelerator_low_balance` | Low balance | رصيد منخفض |
| `accelerator_low_balance_desc` | Top up your wallet | اشحن رصيد محفظتك |
| `pay_negative_balance` | - %1$s %2$s | - %1$s %2$s |

### B. Warning, limit, and cash-blocking copy [obs]

| Key | English | Arabic |
|---|---|---|
| `balance_card_cash_warning` | If you go over the limit, you'll get cash blocked | إذا تجاوزت الحد، سيتم حظر النقد |
| `cash_block_bottom_sheet_text_part_one` | You have crossed your cash limit and owe | لقد تجاوزت حد النقدية وتدين |
| `cash_block_bottom_sheet_text_part_two` | to Careem. | إلى كريم. |
| `cash_block_bottom_sheet_title` | You are blocked for taking cash bookings | لقد تم حظرك من حجز الرحلات النقدية |
| `cash_block_card_payment_info` | You will still receive card bookings | ستستمر في تلقي حجوزات البطاقات |
| `cash_block_notification_text` | You are blocked for cash trips | لقد تم حظرك من الرحلات النقدية |
| `cash_blocked_currency_amount` | %1$s %2$s cash blocked | %1$s %2$s مبلغ محجوز |
| `cash_limit_warning_dialog_title` | Please pay outstanding cash | الرجاء دفع المبلغ النقدي المستحق |
| `cash_limit_warning_dialog_message` | Settle the negative cash balance to avoid getting blocked. | عليك تسوية رصيدك النقدي السلبي لتفادي حظر حسابك. |
| `cash_limit_warning_static` | You're close to your cash limit of %1$s %2$d.<br>Pay %1$s %3$d to avoid getting blocked. | أنت قريب من حدك النقدي %1$s %2$d.<br>ادفع %1$s %3$d لتجنب الحظر. |
| `cash_limit_blocked_dialog_title` | You have exceeded your cash limit | لقد تجاوزت الحد الأقصى للرصيد النقدي |
| `cash_limit_blocked_dialog_message` | You won’t receive any more cash bookings. Please settle the outstanding amount. | لن تستلم أي حجوزات نقدية. يرجى تسوية المبلغ المستحق. |
| `cash_limit_blocked_static` | Blocked for cash bookings.<br>Limit of %1$s %2$d reached. | تم الحظر للحجوزات النقدية.<br>تم الوصول إلى الحد %1$s %2$d. |
| `outstanding_bottomsheet_blocked_text` | You have been blocked for cash transactions because of outstanding payments. | لقد تم حظرك من خدمة التحويل النقدي بسبب المدفوعات المستحقة عليك. |
| `outstanding_payment_blocked_message` | You have been blocked for cash transactions because of outstanding payments on your account. | لقد تم حظرك من خدمة المعاملات النقدية بسبب المدفوعات المستحقة على حسابك. |
| `please_pay_the_outstanding_amount` | Please pay the outstanding amount to avoid getting cash blocked for cash trips. | يرجى دفع المبلغ الغير مُسدد لتجنّب حجز مبالغ الرحلات النقدية. |
| `enter_code_info` | Enter 12 digit code and recharge your account to unblock Cash bookings. | أدخل الرمز الذي يتألف من 12 رقماً لشحن الرصيد وإلغاء حظر الحجوزات النقدية. |
| `underpayments_blocked_title` | Cash transactions blocked | تم حظر التحويلات النقدية |
| `underpayments_warning_message` | Pay %s outstanding from your previous transactions | قم بتسديد %s قيمة المدفوعات المستحقة من معاملاتك السابقة |

### C. Debt origin and outstanding-balance lifecycle [obs]

| Key | English | Arabic |
|---|---|---|
| `underpayment_disallowed_dialog_title` | Collect full trip fare | قم بتحصيل اجر الرحلة بالكامل |
| `underpayment_disallowed_dialog_content` | Collect a minimum of %1$s %2$s to end this trip. | يرجى تحصيل على الاقل %2$s%1$s لتتمكن من انهاء الرحلة |
| `overpayment_disallowed_dialog_title` | Overpayment limit | سقف الدفع أعلى من الأجرة |
| `overpayment_disallowed_dialog_content` | Collect a maximum of %1$s %2$s to end this trip. | يرجى تحصيل %2$s%1$s على الأقل لتتمكن من انهاء الرحلة |
| `pay_underpayments_bubble_text` | Why is this negative? | لماذا هذا الأمر سلبي؟ |
| `pay_underpayment_balance_label` | Balance | الرصيد |
| `pay_underpayment_continue_to_wallet` | Continue to wallet | المتابعة إلى المحفظة |
| `pay_underpayment_please_pay_balance_due` | Please pay your balance due | يرجى دفع الرصيد المستحق |
| `pay_underpayment_review_and_pay` | Review and pay | راجع وادفع |
| `pay_underpayment_failure_title` | %1$s payment failed | فشلت عملية دفع %1$s |
| `pay_underpayment_failure_description` | Sorry, we had a problem processing your payment and you were not charged. Please try again. | عذرًا، حدثت مشكلة أثناء معالجة دفعتك ولم يتم خصم أي مبلغ. يرجى إعادة المحاولة. |
| `amount_entered_too_high_description` | You cannot collect this much cash. Enter a smaller amount, or contact Captain support. | لا يمكنك تحصيل هذا المقدار نقداً. أدخل مبلغاً أصغر، أو اتصل بخدمة دعم الكباتن. |
| `collected_more_than_fare` | You have collected more than the fare | لقد جمعت أكثر من الأجرة |
| `collect_less_than_fare_description` | Make sure you have entered the correct amount. If this is a mistake, it could affect your earnings. | تأكد من إدخالك المبلغ الصحيح. سيؤثر أي خطأ على أرباحك. |
| `TOPUP_CASH_DELTA_NEGATIVE_CREDIT_BALANCED` | Amount settled due to a previous underpayment | المبلغ الذي تم تسويته بسبب دفعة غير كاملة سابقاً |
| `TITLE_PURCHASE_CASH_DELTA_UNADJUSTED` | Negative balance | رصيد سالب |
| `TITLE_PURCHASE_CASH_DELTA_UNDER_BALANCE` | Negative balance | رصيد سالب |
| `TITLE_PURCHASE_NEGATIVE_CREDIT_CHARGED_TO_CREDIT_CARD` | Negative balance settled | رصيد سالب تم تسويته |
| `TOPUP_NEGATIVE_CREDIT_CHARGED_TO_CREDIT_CARD` | Amount settled due to a previous underpayment | المبلغ الذي تم تسويته بسبب دفعة غير كاملة سابقاً |
| `DETAILED_TOPUP_CASH_DELTA_NEGATIVE_CREDIT_BALANCED` | Negative balance settled | رصيد سالب تم تسويته |
| `PURCHASE_CAPTAIN_DEBT_REPAYMENT` | Cash balance settled | تم تسوية الرصيد النقدي |
| `TITLE_PURCHASE_CAPTAIN_DEBT_REPAYMENT` | Cash balance settled | تم تسوية الرصيد النقدي |
| `all_outstanding_payments_text` | All outstanding payments | جميع المدفوعات المستحقة |
| `cashout_outstanding_payment` | You have an outstanding payment | لديك دفعة مستحقة |
| `current_outstanding_text` | Current outstanding payment | المدفوعات المستحقة السداد حاليًا |
| `error_outstanding_payment_text` | Error loading outstanding payment | خطأ في تحميل الدفعة المستحقة |
| `one_outstanding_payment_warning_message` | You have 1 outstanding transaction. Please pay soon to avoid service disruption | لديك معاملة مالية واحدة معلّقة. يرجى تسديد المبالغ المُستحقة في أقرب فرصة لتجنب انقطاع الخدمة. |
| `outstanding_amount` | %s outstanding | %s غير مُسدد |
| `outstanding_amount_changed_title` | Outstanding amount has changed | اختلف المبلغ المستحق |
| `outstanding_amount_changed_body` | Please go back to pay back the updated outstanding amount. | يرجى العودة لتسديد المبلغ المستحق بعد تحديثه. |
| `outstanding_amount_changed_confirm` | Ok, go back | حسنًا، عد إلى الخلف |
| `outstanding_balance_cta` | OK | حسنًا |
| `outstanding_balance_title` | You have outstanding balance | لديك رصيد مستحق |
| `outstanding_balance_description` | We can’t proceed with your request, since you have an outstanding balance of %s. Please visit captain portal to settle the outstanding balance. | لا يمكننا متابعة طلبك، حيث لديك رصيد مستحق قدره %s. يرجى زيارة بوابة الكابتن لتسوية الرصيد المستحق. |
| `outstanding_balance_title_uncleared` | We are calculating your balance | نحن نقوم بحساب رصيدك |
| `outstanding_balance_description_uncleared` | We are computing your final balance at the moment and checking if you have any outstanding balance. Please come back later to delete your account. | نحن نقوم بحساب رصيدك النهائي في الوقت الحالي ونتحقق مما إذا كان لديك أي رصيد مستحق. يرجى العودة لاحقًا لحذف حسابك. |
| `outstanding_bottomsheet_warning_text` | You have outstanding transaction. Please pay soon to avoid service disruption | لديك معاملة مالية معلّقة. يرجى تسديد المبالغ المُستحقة في أقرب فرصة لتجنب انقطاع الخدمة. |
| `outstanding_currency_amount` | %1$s %2$s outstanding | %1$s %2$s غير مسدد |
| `outstanding_payment_title` | Outstanding payment | المدفوعات المستحقة |
| `outstanding_payment_warning_message` | You have %s outstanding transactions. Please pay soon to avoid service disruption. | لديك %s معاملات مالية معلّقة. يرجى تسديد المبالغ المُستحقة في أقرب فرصة لتجنب انقطاع الخدمة. |
| `outstanding_title_key` | Outstanding | غير مسدد |
| `outstanding_transaction_text` | Outstanding during transaction | غير المسددة أثناء المعاملة |
| `total_outstanding_payment_text` | Total outstanding payment | إجمالي المدفوعات المستحقة |

**[obs] Translation discrepancy:** `overpayment_disallowed_dialog_content` says “Collect a **maximum**” in English, but its Arabic says “على الأقل” (“at least / a minimum”). This is quoted as shipped, not corrected.

### D. Repayment and settlement mechanisms [obs]

| Key | English | Arabic |
|---|---|---|
| `payback` | Pay back | سدّد |
| `payback_amount_text` | Pay back %1$s %2$s | سدّد %1$s %2$s |
| `payback_from` | Pay back from | سدّد من |
| `payback_now` | Pay back now | سدّد المبلغ الآن |
| `payback_widget_button_text` | Pay back with Careem Pay | سدّد باستخدام Careem Pay |
| `payback_widget_text` | Outstanding amount | المبلغ المستحق |
| `settle_now_key` | Settle now | تسوية الرصيد الآن |
| `settle_later_key` | Settle later | تسوية الرصيد لاحقًا |
| `pay_settle_cash` | Settle cash balance | قم بتسوية الرصيد الغير مُسدد |
| `pay_settle_negative_balance` | Settle negative balance | تسوية الرصيد السلبي |
| `pay_settle_outstanding_balance_message` | Please, settle outstanding balance of %1$s | يرجى تسوية الرصيد المستحق البالغ %1$s |
| `pay_settle_text` | Settle | التسوية |
| `pay_setteling_negative_balance` | Settling negative cash balance... | تسوية الرصيد النقدي السلبي ... |
| `pay_settle_balance_auto_deduct_message` | Your outstanding cash balance will be automatically settled from your default payment method once it reaches: %1$s | ستتم تسوية رصيدك النقدي المستحق تلقائيًا من خلال طريقة الدفع الافتراضية بمجرد وصول الرصيد إلى:%1$s |
| `pay_auto_settle_balance_msg` | With recurring payment set, Careem will always try to settle maximum of your negative cash balance based on your Captain policy. | مع خيارات الدفعات المتكررة، سنعمل دائمًا في كريم على تسوية أقصى حد من رصيدك النقدي السلبي بحسب سياسة الكابتن الخاصة بك. |
| `pay_add_funds_captain_warning` | Careem credit can only be used to settle cash negative balance and for Careem services | يمكن استخدام رصيد كريم فقط لتسوية الرصيد النقدي السلبي ولخدمات كريم |
| `topup_outstanding_balance_message` | The outstanding %1$s will be deducted first and the rest will go to your Wallet. | سيتم أولاً اقتطاع المبلغ الغير المسدد وقدره %1$s، أما الباقي فسيضاف إلى محفظتك. |
| `settle_cash_continue` | Settle this amount | قم بتسوية المبلغ |
| `settle_cash_failure_desc` | We couldn’t make your transfer at this time. Please try again later. | لم نتمكن من إتمام عملية التحويل. يرجى المحاولة لاحقاً. |
| `settle_cash_range_error` | Please enter an amount between 0 and %s | من فضلك أدخل مبلغ بين 0 و %s |
| `settle_cash_success` | You’ve successfully sent money to Careem. | لقد قمت بإرسال النقود إلى كريم بنجاح. |
| `settle_cash_unsuccessful` | Transfer unsuccessful | لم تتم عملية التحويل |
| `pay_cash_balance_settle_failed` | Sorry, we had a problem settling your balance. Please give it another try. | عذرًا، لقد واجهنا مشكلة خلال تسوية رصيدك. يرجى المحاولة مرة أخرى. |
| `pay_settle_balance_failed_card_description` | We had a problem to Settle Cash Balance  for %1$s | واجهنا مشكلة في تسوية الرصيد النقدي لـ %1$s |
| `pay_negative_cash_balance_settled` | Cash balance settled | تم تسوية الرصيد النقدي |
| `outstanding_message_amount_settled` | You can now continue using all of Careem’s services. | يمكنك الآن الاستمرار باستخدام جميع خدمات كريم. |
| `outstanding_title_amount_settled` | %1$s outstanding payment settled | %1$s تم تسديد الدفعة المستحقة. |
| `paid_outstanding_text` | You paid back | لقد قمت بتسديد |
| `outstanding_pay_progress_text` | Paying back %1$s | تسديد %1$s |
| `pay_outstanding_settled` | %1$s <br>outstanding payment settled | تم تسوية الدفعة المستحقة %1$s<br> |
| `pay_outstanding_settled_promo_subtitle` | You just saved %1$s by settling the outstanding payment. You can now continue using all of Careem’s services. | لقد قمت بتوفير %1$s عبر تسويتك لقيمة الدفعة المستحقة. يمكنك الآن مواصلة استخدام جميع خدمات كريم. |
| `you_are_upto_date` | You’re up to date with all payments for %1$s. | لا يوجد لديك فواتير مستحقة الدفع مع %1$s. |
| `pay_direct_bank_transfer_description` | Transfer from your bank to Careem. | حوّل من حسابك البنكي إلى Careem. |
| `pay_direct_bank_transfer_disabled_desc` | You have reached the maximum number of direct bank transfer requests allowed. | لقد وصلت إلى الحد الأقصى لعدد طلبات التحويل البنكي المباشر المسموح بها. |

### E. Direct captain payout methods and restrictions [obs]

| Key | English | Arabic |
|---|---|---|
| `TITLE_TOPUP_CAPTAIN_EARNINGS_TRANSFER` | Earnings received | مكاسب مُستلمة |
| `TOPUP_CAPTAIN_EARNINGS_TRANSFER` | Earnings received | مكاسب مُستلمة |
| `title_topup_captain_salary` | Careem earnings payout | تحصيل مكاسب كريم |
| `payout_now` | Payout now | ادفع الآن |
| `choose_payout_currency` | Pick a currency | اختر عملة |
| `don_t_have_a_suffecient_balance` | Sorry, you don't have a suffecient balance to request for the payout | عذرًا، ليس لديك رصيد كافٍ لطلب الدفع. |
| `requested_amount_should_be_between_minimum_and_maximum` | The requested amount should be between minimum and maximum thresholds. Please, update the requested amount up to the policy and try to request again | يجب ان يكون المبلغ بين الحد الأدنى والأعلى. الرجاء إعادة إدخال المبلغ بناءًا على التعليمات ثم قم برفع طلب مستحقاتك مرة أخرى |
| `payout_validation_error_min_amount_breach` | Amount should be higher than %1$s %2$s | يجب أن يكون المبلغ أكبر من %1$s %2$s |
| `payout_validation_error_max_amount_breach` | Amount should be less than %1$s %2$s | يجب أن يكون المبلغ أقل من %1$s %2$s |
| `exceeded_the_maximum_daily_payout_amount_limit` | Sorry, you have exceeded the maximum daily payout amount limit. Please, try to payout tomorrow | عذرًا، لقد تجاوزت الحد الأقصى لمبلغ الدفع اليومي. يرجى المحاولة مرة أخرى غدًا. |
| `you_have_sent_too_many_payout_requests` | You have sent too many payout requests recently. Please, try to payout later | لقد أرسلت العديد من طلبات الدفع مؤخرًا. يرجى المحاولة لاحقًا. |
| `sorry_daily_payouts_are_not_available_today` | Sorry, daily payouts are not available today. Please, try to request tomorrow | عذرًا، الدفعات اليومية غير متاحة اليوم. يرجى المحاولة مرة أخرى غدًا. |
| `sorry_daily_payouts_are_not_available` | Sorry, daily payouts are not available for Limo Captains. Please, contact your Limo partner to get more information about your payments | عذرًا، الدفعات اليومية غير متاحة لكباتن ليمو. يرجى الاتصال بشريك ليمو الخاص بك للحصول على مزيد من المعلومات حول دفعاتك. |
| `sorry_we_cannot_process_your_payout_request` | Sorry, we cannot process your payout request due to some pending verifications. Please, visit OC or contact Care for more details | عذرًا، لا يمكننا معالجة طلب الدفع الخاص بك بسبب بعض التحقق المعلق. يرجى زيارة OC أو الاتصال بخدمة كريم للحصول على مزيد من التفاصيل. |
| `sorry_we_noticed_some_fraudulent_activity` | Sorry, we noticed some fraudulent activity connected to your account. Your payout will not be processed | عذرًا، لاحظنا بعض الأنشطة الاحتيالية المرتبطة بحسابك. لن يتم معالجة دفعتك. |
| `error_disallowed_delete_payment_method` | Sorry, you cannot delete the selected payout option. Please, contact Careem support for more information | عذرًا، لا يمكنك حذف خيار الدفع المحدد. يرجى الاتصال بدعم كريم لمزيد من المعلومات. |
| `error_disallowed_update_payment_method` | Sorry, you cannot update the selected payout option. Please, contact Careem support for more information | عذرًا، لا يمكنك تحديث خيار الدفع المحدد. يرجى الاتصال بدعم كريم لمزيد من المعلومات. |
| `error_disallowed_set_primary` | Sorry, you cannot set the selected payment method as your default one. Please, contact Careem support for more information | عذرًا، لا يمكنك تعيين طريقة الدفع المحددة كطريقة افتراضية. يرجى الاتصال بدعم كريم لمزيد من المعلومات. |
| `error_missing_bank_details` | Please, make sure that you filled all of the required Bank details for the payout method and try to submit it again | يرجى التأكد من أنك قد ملأت جميع تفاصيل البنك المطلوبة لطريقة الدفع وحاول إرسالها مرة أخرى |
| `error_missing_required_details` | Please, make sure that you filled all of the required details for the payout method and try to submit it again | يرجى التأكد من أنك قد ملأت جميع التفاصيل المطلوبة لطريقة الدفع وحاول إرسالها مرة أخرى |
| `bottom_sheet_make_primary_title` | Set up this account as a primary one | قم بتعيين هذا الحساب كحساب رئيسي |
| `bottom_sheet_make_primary_desc` | This payment method will be used for all of your payouts. You could update it later as well | ستُستخدم طريقة الدفع هذه في جميع مدفوعاتك، ويمكنك تحديثها لاحقًا عند الحاجة |
| `make_payment_primary_title` | Set up this account as a primary one | قم بتعيين هذا الحساب كحساب رئيسي |
| `make_payment_primary_desc` | This payment method will be used for all of your payouts. You could update it later as well | ستُستخدم طريقة الدفع هذه في جميع مدفوعاتك، ويمكنك تحديثها لاحقًا عند الحاجة |
| `payment_detail_cta_make_primary` | Make this account primary | اجعل هذا الحساب رئيسيًا |
| `payment_method_make_primary_title` | Primary method changed | تم تغيير الطريقة الرئيسية |
| `payment_method_make_primary_desc` | Primary payment method has been successfully changed. | تم تغيير طريقة الدفع الأساسية بنجاح |
| `add_payment_method_review_subtitle` | Please make sure all details are correct | يرجى التأكد من صحة جميع البيانات. |
| `add_payment_method_review_title_bank` | Ready to add bank account? | هل أنت مستعد لإضافة حساب بنكي؟ |
| `add_payment_method_review_title_wallet` | Ready to add wallet? | هل أنت مستعد لإضافة المحفظة؟ |
| `add_payment_method_review_title_cpay` | Ready to add cpay wallet? | جاهز لإضافة محفظة Careem Pay؟ |
| `add_payment_method_review_title_cash_pickup` | Ready to cash pickup? | هل أنت مستعد لاستلام النقود؟ |
| `add_payment_method_wallet_number` | Wallet number | رقم المحفظة |
| `success_add_bank_title` | Your bank is added successfully | تمت إضافة بنكك بنجاح |
| `success_add_bank_desc` | You can now payout money to your bank account. | يمكنك الآن تحويل الأموال إلى حسابك المصرفي. |
| `success_wallet_title` | Your wallet is added successfully | تمت إضافة محفظتك بنجاح. |
| `success_wallet_desc` | You can now payout money to your wallet | يمكنك الآن تحويل الأموال إلى محفظتك |
| `success_cashpickup_title` | Your cash pickup is added successfully | تمت إضافة استلام النقد بنجاح |
| `success_cashpickup_desc` | You can now go to nearest cash pickup to withdraw your money  | يمكنك الآن الذهاب إلى أقرب نقطة استلام نقدي لسحب أموالك |
| `withdraw_request_success_message_title` | Exciting news | أخبار مثيرة |
| `withdraw_request_success_message` | Your money is on its way to your bank account and will be there in just 60 minutes. | أموالك في طريقها إلى حسابك البنكي وستكون هناك خلال 60 دقيقة فقط! |
| `withdraw_request_failure` | Something went wrong. Your withdraw request failed for some reason. Please try again. | لقد فشل طلب السحب بسبب حدوث خطأ ما. يرجى المحاولة من جديد. |

### F. Careem Pay, prepaid-card, bank-withdrawal, and cash-pickup copy [obs]

These are shared payment/wallet resources in the captain APK. Their presence establishes available copy and named flows, **not** that every route is enabled for every captain.

| Key | English | Arabic |
|---|---|---|
| `pay_earning_title_topup` | Transfer earnings | تحويل الأرباح |
| `pay_earning_transfer_screen_title` | Transfer | تحويل |
| `pay_earning_transfer_confirm_button` | Transfer to Careem Pay | تحويل إلى Careem Pay |
| `pay_earning_transfer_confirm_change_button` | Change amount | تعديل المبلغ |
| `pay_earning_transfer_confirm_title` | Are you sure you want to transfer %1$s %2$s to Careem Pay | هل ترغب حقاً بتحويل %1$s %2$s إلى Careem Pay |
| `pay_earning_transfer_confirm_subtitle` | You’ll be able to use this amount to pay for Careem rides, mobile recharges and to transfer it to your friends and family. | سوف تتمكن من استخدام هذا الرصيد للدفع لمشاويرك مع كريم وشحن رصيد هاتفك الجوال وتحويل رصيد إلى لعائلتك وأصدقائك. |
| `pay_earning_transfer_disclaimer` | After you’ve transferred the amount to Careem Pay you can’t cash it out and need to use it on the Careem app. | بعد تحويل الرصيد إلى Careem Pay لن تتمكن من سحب الرصيد نقداً بحيث يجب أن تستخدمه في تطبيق كريم فقط. |
| `pay_earning_transfer_success_title` | You’ve transferred %1$s %2$s to Careem Pay. | لقد قمت بتحويل %2$s %1$s إلى Careem Pay. |
| `pay_receive_your_earnings_right_away` | Receive your earnings right away. No waiting for transfers. | استلم أرباحك فورًا. لا حاجة للانتظار لتحويل الأموال. |
| `prepaid_card_activate_message` | Activate your Careem card to start withdrawing your earnings instantly | فعّل بطاقة كريم الخاصة بك لبدء سحب أرباحك فورًا |
| `prepaid_get_card_message` | Instantly withdraw your earnings at any ATM | اسحب أرباحك فورًا من أي صراف آلي |
| `prepaid_card_add_hint` | You can add %1$s %2$s from captain cash balance | يمكنك إضافة %1$s %2$s من رصيد الكابتن النقدي |
| `prepaid_card_add_money_zero` | You cannot add money as your cash balance is %1$s %2$s | لا يمكنك إضافة مبلغ مالي إلى محفظتك لأن رصيدك النقدي المتاح %1$s%2$s |
| `prepaid_add_amount_disabled_hint` | You cannot add amount as your cash balance is %1$s %2$s. Please settle this amount with Careem. | لا تستطيع إضافة رصيد إضافي لأن قيمة رصيدك المتاح %1$s%2$s. يرجى تسوية حسابك مع كريم. |
| `prepaid_card_topup_success_title` | %s transfer successful | تمت عملية تحويل %s بنجاح |
| `pay_cash_balance` | Cash balance | رصيد نقدي |
| `pay_cash_balance_details` | Includes top-ups, refunds, and money you've received. | يشمل عمليات الشحن، والاستردادات، والأموال التي استلمتها. |
| `pay_cash_balance_use` | Use across Careem, withdraw to bank, or send to friends. | استخدمه عبر Careem، أو اسحب إلى البنك، أو أرسل إلى الأصدقاء. |
| `cashout_withdraw_onboarding_screen_header` | How to withdraw your balance | كيف تسحب رصيدك؟ |
| `cashout_withdraw_onboarding_screen_desc` | Withdraw your full wallet balance, or any amount to your bank account, anytime. Just choose an amount, choose or add a bank account, and tap withdraw. You’ll have it in your bank within one business day. | اسحب رصيد محفظتك بالكامل، أو أي مبلغ إلى حسابك المصرفي في أي وقت. فقط اختر مبلغًا، اختر أو أضف حسابًا مصرفيًا، واضغط على سحب. سيكون في حسابك المصرفي خلال يوم عمل واحد. |
| `cashout_withdraw_money_title` | Withdraw money | سحب الأموال |
| `cashout_withdraw_amount_message` | How much would you like to withdraw? | ما هو المبلغ الذي تريد أن تسحبه؟ |
| `cashout_withdraw_money_available_balance` | Available balance: | الرصيد المتوفر: |
| `cashout_withdraw_money_available_cash_balance` | Cash balance: | الرصيد النقدي: |
| `cashout_withdraw_add_new_bank_account` | Add new bank account | إضافة حساب مصرفي جديد |
| `pay_home_cashout_options` | Choose an option | اختر خيارًا |
| `pay_home_cashout_options_title` | How do you want to withdraw? | كيف تريد السحب؟ |
| `pay_home_cashout_options_subtitle` | Your available balance is %1$s %2$s | رصيدك المتاح هو %1$s %2$s |
| `pay_home_cashout_options_withdraw` | Bank withdraw | سحب بنكي |
| `pay_home_cashout_options_cash_pick` | Cash pick-up | الدفع النقدي |
| `pay_cash_pick_limit_msg` | Maximum limit for Cash pick-up: %1$s %2$s | الحد الأقصى لاستلام النقد: %1$s %2$s |
| `pay_cash_pick_fee_limit_msg` | Important: Only one free cash pick-up per month. %1$s will be charged for each extra cash pick-up in a month | مهم: يُسمح بسحب نقدي مجاني واحد فقط في الشهر. سيتم فرض %1$s على كل سحب نقدي إضافي في الشهر |
| `pay_cash_pick_up_confirm_button` | Withdraw %1$s | سحب %1$s |
| `pay_cash_pick_up_confirm_cta` | Funds not collected will be refunded to your wallet | الأموال التي لم يتم استلامها ستُعاد إلى محفظتك |
| `pay_cash_pick_up_confirm_info` | Important: After %1$s visit any Lulu Exchange branch within next 5 days to collect your cash. Please keep your Emirates ID with you. | مهم: بعد %1$s قم بزيارة أي فرع من فروع لولو للصرافة خلال الأيام الخمسة القادمة لاستلام نقودك. يرجى الاحتفاظ ببطاقة الهوية الإماراتية معك. |
| `pay_cash_pick_up_success_msg` | Your money is on its way and will be available for pick up after %1$s | أموالك في طريقها وستكون متاحة للاستلام بعد %1$s |
| `transfer_to_bank_success_within` | Your transaction of %1$s to your bank account is lined up! You'll receive it within 1 working day once processed. | تم جدولة معاملتك بقيمة %1$s إلى حسابك البنكي! ستتلقاها خلال يوم عمل واحد بمجرد معالجتها. |
| `lb_message_message` | Cashout available in $10 multiples | السحب متاح بمضاعفات $10 |

## Model reconstructed from the copy — all inference

1. **Balance states [inf].** The card vocabulary distinguishes a **positive/transferable balance**, a **zero/current balance**, and a **negative balance**. A separate no-outstanding state says the captain owes no cash and can accept every booking type. “Low balance” and “Pay back later” read as intermediate prompts rather than proof of a separate enforcement state.
2. **Debt formation [inf].** The explicit ledger phrases “previous underpayment” and “outstanding from your previous transactions,” together with full-fare collection warnings, read as a shortfall/underpayment becoming an amount owed to Careem. The strings do not prove that every negative balance has this sole cause; adjustments and other ledger events may also contribute.
3. **Progressive cash consequence [inf].** The copy describes a sequence: negative/outstanding balance → warning when close to a parameterized cash limit, including an amount to pay → cash blocking after the limit is crossed. This is stronger and more specific than a generic “negative wallet” model.
4. **The block is payment-type specific [inf].** “You won’t receive any more cash bookings” and “You will still receive card bookings” explicitly separate cash work from card work. Therefore the cash-limit copy does **not** justify claiming a full account, app, or all-booking suspension. Other generic outstanding-payment strings warn of “service disruption,” but their exact scope is not stated.
5. **Settlement and release [inf].** A captain can be offered “Pay back Careem,” “Settle now/later,” Careem Pay repayment, a bank-to-Careem transfer, or a 12-digit recharge code. The no-outstanding and post-settlement messages read as restoration of all booking types/services after settlement. Actual unblock timing and server enforcement are unknown.
6. **Automatic and prioritized repayment [inf].** One string describes automatic settlement from the default payment method once a parameterized threshold is reached; another describes recurring attempts to settle the maximum negative cash balance under the captain's policy. A top-up is applied to outstanding debt first, with only the remainder going to the wallet. These are distinct copy-described mechanisms, not evidence that both are active together.
7. **Manual and scheduled payout [inf].** A positive balance is “Available to transfer,” with “Transfer now” and “Payout now” actions, plus “Auto transfer on %s.” Adding a payment method is requested before receiving payments, and the primary method is described as being used for all payouts. Bank account, generic wallet, Careem Pay wallet, and cash-pickup review/success strings name the candidate destinations.
8. **Payout has independent gates [inf].** Payout copy names insufficient balance, minimum/maximum request amounts, a maximum daily payout amount, too-frequent requests, daily unavailability, a Limo-partner exception, pending verification, and suspected fraudulent activity. These are separate from the cash-job block; the strings do not establish that one automatically causes the other.
9. **Alternative cash-access routes [inf].** Prepaid-card copy describes moving money from the captain cash balance to a Careem card and withdrawing earnings at an ATM. Cash-pickup copy describes a maximum amount, one free pickup per month with later fees, collection at Lulu Exchange within five days with Emirates ID, and refund of uncollected funds to the wallet. These details are strongly market-specific copy, not a universal Careem rule.
10. **Careem Pay transfer restriction [inf].** The earnings-to-Careem-Pay flow expressly says that after transfer the amount cannot be cashed out and must be used in the Careem app. That restriction should not be erased by the more general `pay_cash_balance_use` copy saying a cash balance can be withdrawn to a bank. Different balance buckets or flows may explain the difference, but static strings cannot reconcile them.
11. **Timing is not one reliable rule [inf].** One withdrawal-success resource says “60 minutes”; wallet-onboarding and bank-success resources say “one business/working day.” They may belong to different rails or be inconsistent copy. No single settlement SLA can be inferred.
12. **Useful Wind-shaped abstraction [inf].** The transferable shape is a continuous bilingual ledger with **explained line items**, a **parameterized debt-warning threshold**, a **cash-only consequence rather than an assumed total ban**, explicit **repayment/restoration copy**, and **payout eligibility errors separated from debt errors**. It does not require copying Careem's wallet, card, Emirates ID, or exchange-provider stack.

## Hard limits of this reading

- **[unk]** No screen was opened and no transaction was performed. This is static resource analysis only.
- **[unk]** Actual threshold values, debt calculation, commission/take rate, fine amounts, settlement timing, payout eligibility, enabled countries, and server-side enforcement are not established.
- **[unk]** Resource presence does not prove that a flow is reachable, enabled, or current for a given captain. Legacy and shared payment resources can coexist in one APK.
- **[unk] Palestine:** whether **any** earnings, debt, blocking, wallet, bank, card, or cash-pickup mechanism applies in Palestine is **unknown**. Emirates ID and Lulu Exchange copy must not be generalized to Palestine.
