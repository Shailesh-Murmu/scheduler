const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const cron = require("node-cron");
const nodemailer = require("nodemailer");
const cors = require("cors");
const session = require("express-session");
const bcrypt = require("bcrypt");
const MongoStore = require("connect-mongo");
const crypto = require("crypto"); // Add at top with other requires
const { generateToken, setExpiration } = require('./utils/tokenGenerator');
const { sendVerificationEmail } = require('./services/emailService');


require("dotenv").config();
const { requireAuth, redirectIfAuthenticated } = require("./middleware/auth");

const app = express();
const port = 3000;

// Middleware setup
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Session configuration
app.use(
  session({
    secret: "your-secret-key-change-this", // Change this to a random string
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB,
    }),
    cookie: {
      secure: false, // Set to true in production with HTTPS
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);


// Database setup
mongoose.connect(process.env.MONGODB)
  .then(async () => {
    await Approval.updateMany(
      { notifiedDays: { $exists: false } },
      { $set: { notifiedDays: [] } }
    );
    console.log("Database connected and notifiedDays field initialized.");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });

// User Schema
// In your existing User schema
// In your existing User schema (app.js or models/User.js)
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  resetRequestTimestamps: { type: [Date], default: [] },
  failedLoginAttempts: { type: Number, default: 0 }, // Track failed attempts
  blockExpires: Date, // When the block expires
  isVerified: { type: Boolean, default: false },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
});

const User = mongoose.model("User", userSchema);

// Approval Schema (your existing schema)
const approvalSchema = new mongoose.Schema({
  state: String,
  location: String,
  plant: String,
  site: String,
  facility: String,
  typeOfApproval: String,
  category: String,
  approvalNo: String,
  grantedOn: Date,
  validTill: Date,
  emails: [String],
  notifiedDays: { type: [Number], default: [] },
  reminderSent: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  stopEmails: { type: Boolean, default: false },
  lastEmailSentAt: { type: Date, default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, default: "Valid" },
});

const Approval = mongoose.model("Approval", approvalSchema);



// Add this route
app.post('/api/add-column', async (req, res) => {
    const { field } = req.body;
    if (!field) return res.status(400).json({ success: false, message: 'Field name required' });

    // 1. Add field to schema dynamically
    Approval.schema.add({ [field]: { type: String, default: '' } }); // You can change type as needed

    // 2. Add field to all existing documents
    await Approval.updateMany({ [field]: { $exists: false } }, { $set: { [field]: '' } });

    res.json({ success: true });
});


// Authentication Routes
app.get("/login", redirectIfAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Forgot Password Page
app.get("/forgot-password", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "forgot-password.html"));
});

app.get("/signup", redirectIfAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "signup.html"));
});


app.post('/api/update-cell', async (req, res) => {
    const { id, field, value } = req.body;
    if (!id || !field) return res.status(400).json({ success: false });

    // Use strict: false to allow updating dynamic fields
    await Approval.findByIdAndUpdate(id, { $set: { [field]: value } }, { strict: false });
    res.json({ success: true });
});


app.post("/api/signup", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.json({ success: false, message: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate verification token
    const token = generateToken();
    const expiration = setExpiration();

    // Create new user (unverified)
    const newUser = new User({
      email,
      password: hashedPassword,
      isVerified: false,
      emailVerificationToken: token,
      emailVerificationExpires: expiration
    });

    await newUser.save();
     // Send verification email
    try {
      sendVerificationEmail(email, token);
    } catch (emailErr) {
      // Optionally, delete user if email fails
      await User.deleteOne({ email });
      return res.json({ success: false, message: "Could not send verification email. Please try again." });
    }

    res.json({ success: true, message: "Account created! Please check your email to verify your account." });
  } catch (error) {
    console.error("Signup error:", error);
    res.json({ success: false, message: "Server error" });
  }
});

// Password Reset Request
// In app.js

app.post("/api/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    // Clean up timestamps older than 24 hours
    const now = new Date();
    user.resetRequestTimestamps = user.resetRequestTimestamps.filter(
      (ts) => now - ts < 24 * 60 * 60 * 1000
    );

    if (user.resetRequestTimestamps.length >= 5) {
      return res.json({
        success: false,
        message:
          "You can only request password reset 5 times per day. Please try again tomorrow.",
      });
    }

    // Add current timestamp
    user.resetRequestTimestamps.push(now);

    // Generate reset token
    const resetToken = crypto.randomBytes(20).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Send email
    sendResetEmail(user.email, resetToken);

    res.json({ success: true, message: "Reset link sent to email" });
  } catch (error) {
    console.error("Reset error:", error);
    res.json({ success: false, message: "Server error" });
  }
});

app.delete("/api/data/:id", async (req, res) => {
  try {
    await Approval.findByIdAndDelete(req.params.id);
    res.sendStatus(200);
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
});

// Add this with your other API routes
// Update the delete endpoint
// Add these at the top with other requires

// Confirmation endpoint
app.get('/api/approvals/:id/confirm-stop', async (req, res) => {
  try {
    const approval = await Approval.findByIdAndUpdate(
      req.params.id,
      { stopEmails: true },
      { new: true }
    );
    if (approval) {
      res.send("Notifications have been stopped for this record.");
    } else {
      res.status(404).send("Record not found.");
    }
  } catch (err) {
    res.status(500).send("Error processing request.");
  }
});

app.delete("/api/approvals/delete-many", requireAuth, async (req, res) => {
  try {
    const { ids } = req.body;

    // Validate input
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid IDs provided",
      });
    }

    // Convert and validate IDs
    const objectIds = ids
      .map((id) => {
        if (mongoose.isValidObjectId(id)) {
          return new mongoose.Types.ObjectId(id);
        } else {
          return null;
        }
      })
      .filter((id) => id !== null);

    if (objectIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid IDs provided",
      });
    }

    // Perform deletion
    const result = await Approval.deleteMany({
      _id: { $in: objectIds },
      userId: req.session.user.id,
    });

    res.json({
      success: true,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Bulk delete error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during bulk deletion",
    });
  }
});


// Add this with your other routes
app.delete('/api/approvals/:id', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    
    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid ID format" 
      });
    }
    
    // Delete only if record belongs to logged-in user
    const result = await Approval.deleteOne({
      _id: id,
      userId: req.session.user.id
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Record not found or not owned by user" 
      });
    }

    res.json({ 
      success: true, 
      message: "Record deleted successfully" 
    });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error during deletion" 
    });
  }
});

app.post('/api/delete-column', async (req, res) => {
    const { field } = req.body;
    if (!field) {
        return res.status(400).json({ success: false, message: 'Field name required' });
    }
    try {
        // Remove the field from all documents
        const result = await Approval.updateMany({}, { $unset: { [field]: "" } });

        // Optionally: Remove from in-memory schema (for current session only)
        if (Approval.schema.path(field)) {
            delete Approval.schema.paths[field];
            delete Approval.schema.tree[field];
        }

        res.json({ success: true, modifiedCount: result.modifiedCount });
    } catch (err) {
        console.error('Update error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});








app.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  try {
    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).send(`
        <html>
        <head>
          <title>Verification Failed</title>
          <style>
            body { font-family: Arial, sans-serif; background: url('https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1500&q=80') no-repeat center center fixed;
  background-size: cover;
                   display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .container { background: white; padding: 40px; border-radius: 8px; 
                        box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center; max-width: 500px; }
            h1 { color: #dc3545; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Verification Failed</h1>
            <p>Invalid or expired verification token. Please request a new verification email.</p>
          </div>
        </body>
        </html>
      `);
    }

    user.isVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    // Send styled success page with auto-redirect
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Email Verified</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              background: url('https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1500&q=80') no-repeat center center fixed;
  background-size: cover;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
            }
            .container {
              background: white;
              padding: 40px 60px;
              border-radius: 15px;
              box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
              text-align: center;
              max-width: 500px;
              border: 1px solid #e0e7ff;
            }
            .success-icon {
              font-size: 72px;
              color: #10b981;
              margin-bottom: 20px;
            }
            h1 {
              color: #047857;
              margin-bottom: 15px;
              font-weight: 600;
            }
            p {
              font-size: 18px;
              color: #4b5563;
              line-height: 1.6;
              margin-bottom: 30px;
            }
            .btn {
              display: inline-block;
              padding: 14px 35px;
              font-size: 17px;
              font-weight: 500;
              color: white;
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              border: none;
              border-radius: 8px;
              text-decoration: none;
              cursor: pointer;
              transition: all 0.3s ease;
              box-shadow: 0 4px 6px rgba(5, 150, 105, 0.2);
            }
            .btn:hover {
              transform: translateY(-3px);
              box-shadow: 0 6px 12px rgba(5, 150, 105, 0.25);
            }
            .countdown {
              color: #6b7280;
              font-size: 16px;
              margin-top: 20px;
            }
          </style>
          <script>
            let count = 5;
            const countdownEl = document.getElementById('countdown');
            
            function updateCountdown() {
              countdownEl.textContent = count;
              if (count <= 0) {
                window.location.href = '/login';
              } else {
                count--;
                setTimeout(updateCountdown, 1000);
              }
            }
            
            window.onload = function() {
              setTimeout(() => {
                window.location.href = '/login';
              }, 5000);
              
              // Start countdown
              updateCountdown();
            };
          </script>
      </head>
      <body>
          <div class="container">
              <div class="success-icon">✓</div>
              <h1>Email Verified Successfully!</h1>
              <p>Your email address has been confirmed. You can now log in to your account and start using our services.</p>
              <a href="/login" class="btn">Go to Login Page</a>
              <div class="countdown">Redirecting in <span id="countdown">5</span> seconds...</div>
          </div>
      </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(`
      <html>
      <head>
        <title>Error</title>
        <style>
          body { font-family: Arial, sans-serif; background: #f8d7da; 
                 display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
          .container { background: white; padding: 40px; border-radius: 8px; 
                      box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center; max-width: 500px; }
          h1 { color: #dc3545; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>⚠️ Verification Error</h1>
          <p>An unexpected error occurred: ${error.message}</p>
          <p>Please contact support for assistance.</p>
        </div>
      </body>
      </html>
    `);
  }
});






// Password Reset Page
app.get("/reset-password/:token", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "reset-password.html"));
});

// Password Update Handler
app.post("/api/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.json({ success: false, message: "Invalid or expired token" });
    }

    // Update password
    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("Password reset error:", error);
    res.json({ success: false, message: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ success: false, message: "Invalid credentials" });
    }

    // Check if user is blocked
    if (user.blockExpires && user.blockExpires > new Date()) {
      return res.json({
        success: false,
        message: "Wrong Password entered 5 times. Please try again tomorrow.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= 5) {
        user.blockExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        user.failedLoginAttempts = 0;
      }
      await user.save();
      return res.json({ success: false, message: "Invalid credentials" });
    }

    // Reset failed attempts on successful login
    user.failedLoginAttempts = 0;
    user.blockExpires = null;

    // Check email verification BEFORE saving and session creation
    if (!user.isVerified) {
      return res.status(403).json({ 
        success: false, 
        message: 'Please verify your email before logging in.' 
      });
    }

    await user.save();

    req.session.user = {
      id: user._id,
      email: user.email,
    };

    res.json({ success: true, message: "Login successful" });
  } catch (error) {
    console.error("Login error:", error);
    res.json({ success: false, message: "Server error" });
  }
});


app.post("/api/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.json({ success: false, message: "Logout failed" });
    }
    res.json({ success: true, message: "Logout successful" });
  });
});

// Protected Routes
app.get("/", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public/indexs.html"));
});

app.get("/track", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "track.html"));
});

// API Routes (Protected)
app.get("/api/data", requireAuth, async (req, res) => {
  try {
    const data = await Approval.find({ userId: req.session.user.id });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

// Form Submission Route (Protected and Modified)
app.post("/submit", requireAuth, async (req, res) => {
  try {
    let {
      state,
      location,
      plant,
      site,
      facility,
      typeOfApproval,
      category,
      approvalNo,
      grantedOn,
      validTill,
      emails,
    } = req.body;

    // Convert comma-separated string to array
    if (typeof emails === "string") {
      emails = emails
        .split(",")
        .map((email) => email.trim())
        .filter((email) => email.length > 0);
    }

    // Validate emails array
    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).send("At least one email is required");
    }

    const invalidEmails = emails.filter((email) => !validateEmail(email));
    if (invalidEmails.length > 0) {
      return res
        .status(400)
        .send(`Invalid emails: ${invalidEmails.join(", ")}`);
    }

    if (!validateRequiredFields(req.body)) {
      return res.status(400).send("All fields are required");
    }

    const dates = parseDates(grantedOn, validTill);
    if (!dates.valid) {
      return res.status(400).send("Invalid date format");
    }

    const newApproval = new Approval({
      state,
      location,
      plant,
      site,
      facility,
      typeOfApproval,
      category,
      approvalNo,
      grantedOn: dates.grantedOnDate,
      validTill: dates.validTillDate,
      emails,
      userId: req.session.user.id, // Associate with logged-in user
    });

    await newApproval.save();
        res.send("Approval registered successfully");
    } catch (err) {
        res.status(500).send("Database error");
    }
});

// Excel Upload Route (Protected and Modified)
app.post("/api/upload-excel", requireAuth, async (req, res) => {
  try {
    const data = req.body.data;
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No valid data provided" });
    }

    const transformedData = data.map((record) => {
      const transformed = {
        state: record["State"] || record["state"] || "",
        location: record["Location"] || record["location"] || "",
        plant: record["Plant"] || record["plant"] || "",
        site: record["Site"] || record["site"] || "",
        facility: record["Facility"] || record["facility"] || "",
        typeOfApproval:
          record["Type of approval"] || record["typeOfApproval"] || "",
        category: record["Category"] || record["category"] || "",
        approvalNo: record["Approval No."] || record["approvalNo"] || "",
        emails: record["emails"],
        userId: req.session.user.id, // Associate with logged-in user
      };

      // Handle date fields
      if (record["Granted on"] || record["grantedOn"]) {
        const grantedDate = new Date(
          record["Granted on"] || record["grantedOn"]
        );
        transformed.grantedOn = isNaN(grantedDate.getTime())
          ? new Date()
          : grantedDate;
      } else {
        transformed.grantedOn = new Date();
      }

      if (record["Valid till"] || record["validTill"]) {
        const validDate = new Date(record["Valid till"] || record["validTill"]);
        transformed.validTill = isNaN(validDate.getTime())
          ? new Date()
          : validDate;
      } else {
        transformed.validTill = new Date();
      }

      transformed.reminderDate = calculateReminderDate(transformed.validTill);
      transformed.reminderSent = false;
      return transformed;
    });

    const inserted = await Approval.insertMany(transformedData);
    console.log(`Successfully inserted ${inserted.length} records from Excel`);

    res.json({
      success: true,
      insertedCount: inserted.length,
      message: `Successfully uploaded ${inserted.length} approval records`,
    });
  } catch (err) {
    console.error("Excel upload error:", err);
    res
      .status(500)
      .json({ success: false, message: `Database error: ${err.message}` });
  }
});

// Stop emails route (Protected and Modified)
app.post("/api/stop-emails/:id", requireAuth, async (req, res) => {
  try {
    const updated = await Approval.findOneAndUpdate(
      { _id: req.params.id, userId: req.session.user.id }, // Ensure user owns the record
      { $set: { stopEmails: true } },
      { new: true }
    );
    res.sendStatus(updated ? 200 : 404);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

// Helper functions (your existing functions)
function calculateReminderDate(validTillDate) {
  const reminderDate = new Date(validTillDate);
  reminderDate.setMonth(reminderDate.getMonth() - 3);
  return reminderDate;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateRequiredFields(fields) {
  const required = [
    "state",
    "location",
    "plant",
    "site",
    "facility",
    "typeOfApproval",
    "category",
    "approvalNo",
    "grantedOn",
    "validTill",
    "emails",
  ];
  return required.every((field) => fields[field]);
}

function parseDates(grantedOn, validTill) {
  const grantedOnDate = new Date(grantedOn);
  const validTillDate = new Date(validTill);
  return {
    valid: !isNaN(grantedOnDate.getTime()) && !isNaN(validTillDate.getTime()),
    grantedOnDate,
    validTillDate,
  };
}

// EmailJS Configuration (your existing configuration)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // replace with your email
    pass: process.env.EMAIL_PASS, // use App Password if using Gmail
  },
});

// Email sending function (add anywhere in app.js)
function sendResetEmail(email, token) {
  const mailOptions = {
    from: "your-email@gmail.com",
    to: email,
    subject: "Password Reset Request",
    html: `
            <p>You requested a password reset. Click the link below:</p>
            <a href="https://scheduler-98q6.onrender.com/reset-password/${token}">
                Reset Password
            </a>
            <p>This link expires in 1 hour.</p>
        `,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) console.error("Email error:", error);
    else console.log("Email sent:", info.response);
  });
}

cron.schedule(
  "* * * * *",
  async () => {
    try {
      const approvals = await Approval.find({ stopEmails: { $ne: true } });
      const currentDate = new Date();
      const now = new Date();
      await Approval.updateMany(
        { validTill: { $lt: now }, status: { $ne: "Not Valid" } },
        { $set: { status: "Not Valid" } }
      );

      for (const approval of approvals) {
        try {
          const validTillDate = new Date(approval.validTill);
          const daysRemaining = Math.ceil(
            (validTillDate - currentDate) / (1000 * 60 * 60 * 24)
          );
          const exists = await Approval.exists({ _id: approval._id });
          if (!exists) {
            console.warn(`Skipping deleted approval: ${approval._id}`);
            continue;
          }
          // Skip expired approvals
          if (daysRemaining < 120) {
      if (approval.lastEmailSentAt) {
        approval.lastEmailSentAt = null;
        await approval.save();
      }
      continue;
    }

          const targetDays = [240, 210, 180, 150, 135, 127,120];
          const shouldNotify =
            (targetDays.includes(daysRemaining)) &&
            !approval.notifiedDays.includes(daysRemaining); // Critical check

          if (shouldNotify) {
            await sendReminderEmail(approval, daysRemaining);
            approval.notifiedDays.push(daysRemaining);
            approval.lastEmailSentAt = new Date();
            await approval.save();
          }
        } catch (err) {
          console.error(`Error processing approval ${approval._id}:`, err);
        }
      }
    } catch (err) {
      console.error("Cron job error:", err);
    }
  },
  { timezone: "Asia/Kolkata" }
);

// Email sending function (Fixed)
async function sendReminderEmail(approval) {
  try {
    const validTillDate = new Date(approval.validTill);
    const grantedDate = new Date(approval.grantedOn);
    const daysRemaining = Math.ceil(
      (validTillDate - new Date()) / (1000 * 60 * 60 * 24)
    );

    // Prevent sending emails for expired approvals
    if (daysRemaining < 120) return;

    // Determine which emails to notify based on daysRemaining
    let emailsToNotify = [];
    if (daysRemaining === 240 || daysRemaining === 210 || daysRemaining === 180) {
      if (approval.emails && approval.emails.length >= 1)
        emailsToNotify = [approval.emails[0]];
    } else if (daysRemaining === 150) {
      if (approval.emails && approval.emails.length >= 3)
        emailsToNotify = [
          approval.emails[0],
          approval.emails[1],
          approval.emails[2],
        ];
    } else if (daysRemaining === 135) {
      if (approval.emails && approval.emails.length >= 4)
        emailsToNotify = [
          approval.emails[0],
          approval.emails[1],
          approval.emails[2],
          approval.emails[3],
        ];
    } else if (daysRemaining === 127) {
      if (approval.emails && approval.emails.length >= 4)
        emailsToNotify = approval.emails;
    } else if (
      (daysRemaining === 120)
    ) {
      if (approval.emails && approval.emails.length > 0)
        emailsToNotify = approval.emails;
    } else return;

    // Validate emails
    const validEmails = emailsToNotify.filter((email) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    );
    if (validEmails.length === 0) return;

    // Set 'to' as the first email, 'cc' as the rest (if any)
    const toEmail = validEmails[0];
    const ccEmails = validEmails.length > 1 ? validEmails.slice(1) : undefined;
    
    
      const mailOptions = {
        from: '"Approvals Reminder" <your.email@gmail.com>', // sender address
        to: toEmail,
        cc: ccEmails,
        subject: `🚨 Approval Expiry Reminder - ${approval.approvalNo}`,
        html: `
          <h3>Approval Expiry Reminder</h3>
          <p><strong>Facility Name:</strong> ${approval.facility}</p>
          <p><strong>Approval Number:</strong> ${approval.approvalNo}</p>
          <p><strong>Approval Type:</strong> ${approval.typeOfApproval}</p>
          <p><strong>Approval Category:</strong> ${approval.category}</p>
          <p><strong>Facility Location:</strong> ${approval.location}, ${approval.state}</p>
          <p><strong>Granted On:</strong> ${grantedDate.toDateString()}</p>
          <p><strong>Valid Till:</strong> ${validTillDate.toDateString()}</p>
          <p><strong>Days Remaining:</strong> ${daysRemaining-120}</p>
          <hr>
          <p>Please take necessary actions before expiry.</p>
        `,
      };

      await transporter.sendMail(mailOptions);
    

    // Update lastEmailSentAt
    approval.lastEmailSentAt = new Date();
    await approval.save();
  } catch (err) {
    console.error("Email send error:", err);
    throw err;
  }
}

// Add near other API endpoints, after express middlewares and before your app.listen

// This endpoint listens for JSON payloads sent by Google Apps Script
app.post('/api/form-submission', async (req, res) => {
  try {
    // Get data from Google Apps Script POST
    const { approvalId, email, fileUrl } = req.body;

    if (!approvalId || !email || !fileUrl) {
      return res.status(400).json({ success: false, message: "Missing required fields." });
    }

    // Find the relevant record in your Approvals collection using Approval ID
    const approval = await Approval.findOne({ _id: approvalId });
    if (!approval) {
      return res.status(404).json({ success: false, message: "Approval not found." });
    }

    // 1. SAVE UPLOADED FILE LINK IN DB
    approval.uploadedFormDocs = approval.uploadedFormDocs || [];
    approval.uploadedFormDocs.push({ email, fileUrl, submittedAt: new Date() });
    await approval.save();

    // 2. SEND NOTIFICATION EMAIL TO THE 4th (or LAST) APPROVER
    // Determine the approver's email
    let recipient = '';
    if (approval.emails.length >= 4) {
      recipient = approval.emails[3];
    } else if (approval.emails.length > 0) {
      recipient = approval.emails[approval.emails.length - 1];
    } else {
      // No email to send to
      return res.status(200).json({ success: true, message: "No approver email found to notify, saved file URL." });
    }

    // Compose record details (customize for your actual fields)
    const details = `
      <strong>Approval Details:</strong><br>
      State: ${approval.state}<br>
      Location: ${approval.location}<br>
      Plant: ${approval.plant}<br>
      Site: ${approval.site}<br>
      Facility: ${approval.facility}<br>
      Type: ${approval.typeOfApproval}<br>
      Category: ${approval.category}<br>
      Approval No.: ${approval.approvalNo}<br>
      Granted On: ${approval.grantedOn ? new Date(approval.grantedOn).toLocaleDateString() : ''}<br>
      Valid Till: ${approval.validTill ? new Date(approval.validTill).toLocaleDateString() : ''}<br>
    `;

    // Build the confirmation URL
    const confirmLink = `https://scheduler-98q6.onrender.com/api/approvals/${approval._id}/confirm-stop`;

    // Compose email
    const mailOptions = {
      from: '"Approvals System" <shaileshmurmucool@email.com>', // Update with your address
      to: recipient,
      subject: 'Request for Stop Notification Emails: Approval ' + approval.approvalNo,
      html: `
        <p>A request has been made to stop future email notifications for the following record:</p>
        ${details}
        <p><strong>Uploaded Document from Requestor:</strong><br>
        <a href="${fileUrl}" target="_blank">${fileUrl}</a><br><br>
        <em>Requested by:</em> ${email}</p>
        <p>To approve and stop notifications, <a href="${confirmLink}" target="_blank">click here</a>.</p>
      `
    };

    // Send the email (transporter is your existing nodemailer transporter)
    await transporter.sendMail(mailOptions);
    console.log(`Notified ${recipient} with stop request for approval ID ${approvalId}`);


    // 3. Respond as success
    res.json({ success: true, message: `Received and notified approver for approval ID ${approvalId}` });
  } catch (error) {
    console.error('Error handling Google Form submission:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
