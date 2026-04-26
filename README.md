# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Razorpay Appointment Payments

Razorpay checkout is wired through `server/signaling-server.js`. Razorpay handles the hosted payment UI, but the app still needs this backend because `RAZORPAY_KEY_SECRET` and signature verification must never be placed in the mobile app.

Backend environment:

```bash
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=your_secret_key
PAYMENT_APP_NAME="Nvoisys Health"
SIGNALING_PORT=8080
```

App config:

```json
{
  "extra": {
    "paymentMode": "razorpay",
    "paymentBackendUrl": "https://your-payment-server.example.com",
    "razorpayReturnUrl": "myapp://payment/razorpay"
  }
}
```

For local device testing, do not use `localhost` in `paymentBackendUrl` unless the app is running on the same machine. Use your LAN IP or an HTTPS tunnel such as ngrok/cloudflared.

Start the backend:

```bash
npm run signaling
```

Settlement happens in your Razorpay merchant dashboard to the bank account you add during KYC. RuPay is available as a card option in checkout; settlement is not directly to a RuPay card.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
