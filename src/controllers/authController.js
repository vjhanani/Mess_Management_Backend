const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Student = require("../models/Student");
const MessManager = require("../models/MessManager");
const { sendOTPEmail } = require("../utils/mailer");

const otpStore = {};

const generateToken = (user, role) => {
  return jwt.sign(
    { id: role === "student" ? user.rollNo : user.id, role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

exports.registerStudent = async (req, res) => {
  try {
    const { name, rollNo, email, password, roomNo } = req.body;

    // optional IITK validation
    if (!email.endsWith("@iitk.ac.in")) {
      return res.status(400).json({ error: "Use IITK email" });
    }

    const existing = await Student.findOne({ where: { rollNo } });
    if (existing) {
      return res.status(400).json({ error: "Student already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const otp = Math.floor(100000 + Math.random() * 900000);

    otpStore[email] = {
      otp,
      data: { name, rollNo, email, password: hashedPassword, roomNo },
      expires: Date.now() + 5 * 60 * 1000
    };

    await sendOTPEmail(email, otp);

    res.json({ message: "OTP sent to email" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const record = otpStore[email];

    if (!record) {
      return res.status(400).json({ error: "No OTP found" });
    }

    if (record.expires < Date.now()) {
      delete otpStore[email];
      return res.status(400).json({ error: "OTP expired" });
    }

    if (record.otp != otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    const student = await Student.create(record.data);

    delete otpStore[email];

    const token = generateToken(student, "student");

    res.json({
      message: "Registration successful",
      token,
      student
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    const record = otpStore[email];

    if (!record) {
      return res.status(400).json({ error: "No pending registration" });
    }

    const newOtp = Math.floor(100000 + Math.random() * 900000);

    otpStore[email].otp = newOtp;
    otpStore[email].expires = Date.now() + 5 * 60 * 1000;

    await sendOTPEmail(email, newOtp);

    res.json({ message: "OTP resent" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password, role } = req.body;

    let user;

    if (role === "student") {
      user = await Student.findOne({ where: { email } });
    } else {
      user = await MessManager.findOne({ where: { email } });
    }

    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    const isMatch = role=== "student" ? await bcrypt.compare(password, user.password) : password === user.password;

    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    if (role === "student") {
      if (user.status === "Pending") {
        return res.status(403).json({
          error: "Your account is pending approval by manager"
        });
      }

      if (user.status === "Rejected") {
        return res.status(403).json({
          error: "Your account has been rejected"
        });
      }
    }

    const token = generateToken(user, role);

    res.json({
      message: "Login successful",
      token,
      role,
      status: user.status
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    let user;

    if (req.user.role === "student") {
      user = await Student.findByPk(req.user.rollNo);
    } else {
      user = await MessManager.findByPk(req.user.id);
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);

    if (!isMatch) {
      return res.status(400).json({ error: "Old password incorrect" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: "Password changed successfully" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ error: "Only students allowed" });
    }

    const student = await Student.findByPk(req.user.rollNo, {
      attributes: { exclude: ["password"] }
    });

    res.json(student);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
