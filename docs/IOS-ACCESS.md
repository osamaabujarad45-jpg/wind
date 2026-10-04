# iPhone access

## Available now: installable web app

Open [Wind](https://wind-production-72aa.up.railway.app) in **Safari** on an iPhone, tap **Share**, then choose **Add to Home Screen**. The saved app opens in its own window and uses the same Wind account, API, role-based registration, trip history and foreground location flow as Android. Location works only while the web app is open and an active driver job is being tracked.

This is the free public access path. It avoids pretending that an unsigned `.ipa` download is a safe or supported way to distribute an iPhone app.

## Native iPhone release

The Expo configuration already reserves bundle identifier `ps.wind.app`, declares only foreground location, and has no non-exempt encryption. The native release path is:

1. Enroll the account holder in the Apple Developer Program.
2. Build the existing iOS target with the production HTTPS API URL.
3. Upload to App Store Connect and create a TestFlight external-testing group.
4. Share the generated TestFlight public link, then submit the reviewed build to the App Store when operations are ready.

Apple requires its paid Developer Program for public App Store and TestFlight distribution. TestFlight is the best public-link beta experience: it supports up to 10,000 external testers, requires review for the first external build, and each build expires after 90 days. A free Apple account can only provision personal test devices temporarily; it cannot distribute Wind to real users.

## Release requirements before native submission

- Provide a privacy-policy URL, account-deletion URL, support contact and App Store review accounts.
- Keep ride and freight disabled until the required operational licensing, driver vetting and payment/return workflows are ready.
- Test the exact iOS build on a real iPhone: sign-up, driver approval, accepted-job GPS, denied GPS, order history, RTL and poor-network recovery.

Sources: [Apple Developer Program membership](https://developer.apple.com/help/account/membership/program-enrollment/), [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/), and [Expo web publishing](https://docs.expo.dev/guides/publishing-websites/).
