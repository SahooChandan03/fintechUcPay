const nodemailer = require('nodemailer');
const twilio = require('twilio');

class NotificationService {
  constructor() {
    this.emailTransporter = null;
    this.twilioClient = null;
    // this.initializeServices();
  }

  initializeServices() {
    // Initialize email transporter
    if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      this.emailTransporter = nodemailer.createTransporter({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });
    }

    // Initialize Twilio client
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    }
  }

  // Send OTP via email
  async sendEmailOTP(email, otp, purpose = 'registration') {
    if (!this.emailTransporter) {
      throw new Error('Email service not configured');
    }

    const subject = this.getEmailSubject(purpose);
    const html = this.getEmailTemplate(otp, purpose);

    try {
      const info = await this.emailTransporter.sendMail({
        from: `"UC-PAY" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: subject,
        html: html,
      });

      console.log('Email sent: %s', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Email sending failed:', error);
      throw new Error('Failed to send email OTP');
    }
  }

  // Send OTP via SMS
  async sendSMSOTP(phoneNumber, otp, purpose = 'registration') {
    if (!this.twilioClient) {
      throw new Error('SMS service not configured');
    }

    const message = this.getSMSMessage(otp, purpose);

    try {
      const result = await this.twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber,
      });

      console.log('SMS sent: %s', result.sid);
      return { success: true, messageId: result.sid };
    } catch (error) {
      console.error('SMS sending failed:', error);
      throw new Error('Failed to send SMS OTP');
    }
  }

  // Send OTP via preferred method (email or SMS)
  async sendOTP(identifier, otp, purpose = 'registration') {
    // Determine if identifier is email or phone
    const isEmail = identifier.includes('@');
    
    if (isEmail) {
      return await this.sendEmailOTP(identifier, otp, purpose);
    } else {
      return await this.sendSMSOTP(identifier, otp, purpose);
    }
  }

  // Get email subject based on purpose
  getEmailSubject(purpose) {
    const subjects = {
      registration: 'UC-PAY Registration OTP',
      login: 'UC-PAY Login OTP',
      forgotPassword: 'UC-PAY Password Reset OTP',
      default: 'UC-PAY OTP'
    };
    return subjects[purpose] || subjects.default;
  }

  // Get email template
  getEmailTemplate(otp, purpose) {
    const actionText = {
      registration: 'complete your registration',
      login: 'login to your account',
      forgotPassword: 'reset your password',
      default: 'verify your identity'
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>UC-PAY OTP</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .otp-box { background: white; padding: 20px; margin: 20px 0; text-align: center; border-radius: 8px; }
          .otp-code { font-size: 32px; font-weight: bold; color: #2563eb; letter-spacing: 4px; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>UC-PAY</h1>
          </div>
          <div class="content">
            <h2>Your OTP Code</h2>
            <p>Use this code to ${actionText[purpose] || actionText.default}:</p>
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
            </div>
            <p><strong>Important:</strong></p>
            <ul>
              <li>This code will expire in 5 minutes</li>
              <li>Never share this code with anyone</li>
              <li>If you didn't request this code, please ignore this email</li>
            </ul>
          </div>
          <div class="footer">
            <p>© 2024 UC-PAY. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Get SMS message
  getSMSMessage(otp, purpose) {
    const actionText = {
      registration: 'complete your registration',
      login: 'login to your account',
      forgotPassword: 'reset your password',
      default: 'verify your identity'
    };

    return `UC-PAY: Your OTP is ${otp}. Use this code to ${actionText[purpose] || actionText.default}. Valid for 5 minutes. Do not share this code.`;
  }
}

module.exports = new NotificationService(); 