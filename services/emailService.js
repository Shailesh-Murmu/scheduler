const nodemailer = require('nodemailer');
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  port: 587,
  secure: false,
  debug: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS // Use app password here
  }
});

// Verify connection
transporter.verify((error) => {
  if (error) {
    console.error("SMTP Connection Failed:", error);
  } else {
    console.log("SMTP Connection Ready");
  }
});

module.exports.sendVerificationEmail = async (email, token) => {
  const verificationLink = `https://scheduler-2de0.onrender.com/verify-email?token=${token}`;
  
  try {
    const info = await transporter.sendMail({
      from: '"Your App" <noreply@yourapp.com>',
      to: email,
      subject: 'Verify Your Email Address',
      html: `
        <p>Please click the link below to verify your email address:</p>
        <p><a href="${verificationLink}">${verificationLink}</a></p>
        <p>This link expires in 24 hours.</p>
      `
    });
    console.log("Email sent:", info.messageId);
    return info;
  } catch (error) {
    console.error("Email Send Error:", error);
    throw error;
  }
};
