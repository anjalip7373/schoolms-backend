const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');

const authController = require('../controllers/authController');
const studentController = require('../controllers/studentController');
const attendanceController = require('../controllers/attendanceController');
const feeController = require('../controllers/feeController');
const salaryController = require('../controllers/salaryController');
const employeeController = require('../controllers/employeeController');
const configController = require('../controllers/configController');
const dashboardController = require('../controllers/dashboardController');
const marksController = require('../controllers/marksController');
const broadcastController = require('../controllers/broadcastController');

// Safe Callback Fallback Utility to prevent server crash if any function is undefined
const safeCall = (cb) => {
  return cb ? cb : (req, res) => res.status(501).json({ message: "Action handler not implemented yet." });
};

// Auth
router.post('/auth/login', safeCall(authController.login));
router.get('/auth/profile', authenticateToken, safeCall(authController.getProfile));
router.put('/auth/profile', authenticateToken, safeCall(authController.updateProfile));
router.put('/auth/change-password', authenticateToken, safeCall(authController.changePassword));
router.post('/auth/forgot-password', safeCall(authController.resetPasswordRequest));
router.post('/auth/verify-reset', safeCall(authController.verifyResetAndSetPassword));
router.put('/auth/admin-reset-password', authenticateToken, safeCall(authController.adminResetPassword));
router.get('/auth/users-for-reset', authenticateToken, safeCall(authController.getAllUsersForReset));
router.get('/auth/me', authenticateToken, safeCall(authController.me));

// Dashboard
router.get('/dashboard', authenticateToken, safeCall(dashboardController.getDashboard));

// Students
router.get('/students', authenticateToken, safeCall(studentController.getAllStudents));
router.get('/students/:id', authenticateToken, safeCall(studentController.getStudentById));
router.post('/students', authenticateToken, safeCall(studentController.addStudent));
router.put('/students/:id', authenticateToken, safeCall(studentController.updateStudent));

// Attendance
router.get('/attendance', authenticateToken, safeCall(attendanceController.getAttendance));
router.post('/attendance', authenticateToken, safeCall(attendanceController.saveAttendance));
router.get('/attendance/report', authenticateToken, safeCall(attendanceController.getAttendanceReport));
router.get('/attendance/daily-report', authenticateToken, safeCall(attendanceController.getDailyReport));

// Fee
router.get('/fees', authenticateToken, safeCall(feeController.getFeePayments));
router.get('/fees/all-students-status', authenticateToken, safeCall(feeController.getAllStudentsWithFeeStatus));
router.get('/fees/dashboard-stats', authenticateToken, safeCall(feeController.getDashboardFeeStats));
router.post('/fees', authenticateToken, safeCall(feeController.createFeePayment));
router.get('/fees/receipt/:id', authenticateToken, safeCall(feeController.getReceiptById));

// Salary
router.get('/salary', authenticateToken, safeCall(salaryController.getSalarySlips));
router.get('/salary/all-employees-status', authenticateToken, safeCall(salaryController.getAllEmployeesWithSalaryStatus));
router.get('/salary/dashboard-stats', authenticateToken, safeCall(salaryController.getDashboardSalaryStats));
router.post('/salary', authenticateToken, safeCall(salaryController.generateSalarySlip));
router.put('/salary/:id/paid', authenticateToken, safeCall(salaryController.updateSalaryStatus));
router.get('/salary/:id', authenticateToken, safeCall(salaryController.getSalarySlipById));

// Employees
router.get('/employees', authenticateToken, safeCall(employeeController.getAllEmployees));
router.get('/employees/:id', authenticateToken, safeCall(employeeController.getEmployeeById));
router.post('/employees', authenticateToken, safeCall(employeeController.addEmployee));
router.put('/employees/:id', safeCall(employeeController.updateEmployee));
router.put('/employees/:id/toggle-status', authenticateToken, safeCall(employeeController.toggleEmployeeStatus));

// Config Core
router.get('/config/classes', authenticateToken, safeCall(configController.getClasses));
router.post('/config/classes', authenticateToken, requireRole('admin'), safeCall(configController.addClass));
router.put('/config/classes/:id', authenticateToken, requireRole('admin'), safeCall(configController.updateClass));
router.delete('/config/classes/:id', authenticateToken, requireRole('admin'), safeCall(configController.deleteClass));

router.get('/config/fee-types', authenticateToken, safeCall(configController.getFeeTypes));
router.post('/config/fee-types', authenticateToken, requireRole('admin'), safeCall(configController.addFeeType));
router.put('/config/fee-types/:id', authenticateToken, requireRole('admin'), safeCall(configController.updateFeeType));
router.delete('/config/fee-types/:id', authenticateToken, requireRole('admin'), safeCall(configController.deleteFeeType));

// Roles Management
router.get('/config/roles', authenticateToken, safeCall(configController.getRoles));
router.post('/config/roles', authenticateToken, requireRole('admin'), safeCall(configController.addRole));
router.put('/config/roles/:id', authenticateToken, requireRole('admin'), safeCall(configController.updateRole));
router.delete('/config/roles/:id', authenticateToken, requireRole('admin'), safeCall(configController.deleteRole));

// Dynamic Exam Settings Criteria Maps
router.get('/config/exam-settings', authenticateToken, safeCall(configController.getExamSettings));
router.post('/config/exam-settings', authenticateToken, requireRole('admin'), safeCall(configController.saveExamSettings));
router.delete('/config/exam-settings/:id', authenticateToken, requireRole('admin'), safeCall(configController.deleteExamSetting));

// Subjects
router.get('/subjects', authenticateToken, safeCall(marksController.getSubjects));
router.post('/subjects', authenticateToken, safeCall(marksController.addSubject));
router.put('/subjects/:id', authenticateToken, safeCall(marksController.updateSubject));
router.delete('/subjects/:id', authenticateToken, safeCall(marksController.deleteSubject));

// Exam Types (CRUD Operations Configured Safely)
router.get('/exam-types', authenticateToken, safeCall(marksController.getExamTypes));
router.post('/exam-types', authenticateToken, safeCall(marksController.addExamType));
router.put('/exam-types/:id', authenticateToken, safeCall(marksController.updateExamType));
router.delete('/exam-types/:id', authenticateToken, safeCall(marksController.deleteExamType));

// Class-wise subjects
router.get('/class-subjects', authenticateToken, safeCall(marksController.getClassSubjects));
router.post('/class-subjects', authenticateToken, safeCall(marksController.assignClassSubject));
router.delete('/class-subjects/:id', authenticateToken, safeCall(marksController.removeClassSubject));

// Marks Engine
router.get('/marks/remarks', authenticateToken, safeCall(marksController.getRemarks));
router.post('/marks/remarks', authenticateToken, safeCall(marksController.saveRemarks));
router.get('/marks/marksheet', authenticateToken, safeCall(marksController.getMarksheet));
router.get('/marks', authenticateToken, safeCall(marksController.getMarks));
router.post('/marks', authenticateToken, safeCall(marksController.saveMarks));

router.get('/teacher-assigned-subjects', authenticateToken, safeCall(marksController.getTeacherAssignedSubjects));
router.post('/teacher-assigned-subjects', authenticateToken, safeCall(marksController.saveTeacherAssignedSubjects));

// Broadcasts
router.get('/broadcasts', authenticateToken, safeCall(broadcastController.getBroadcasts));
router.post('/broadcasts', authenticateToken, safeCall(broadcastController.sendBroadcast));
router.post('/broadcasts/whatsapp', authenticateToken, safeCall(broadcastController.sendWhatsAppBroadcast));
router.delete('/broadcasts/:id', authenticateToken, safeCall(broadcastController.deleteBroadcast));

module.exports = router;