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

// Auth (Fully Intact)
router.post('/auth/login', authController.login);
router.get('/auth/profile', authenticateToken, authController.getProfile);
router.put('/auth/profile', authenticateToken, authController.updateProfile);
router.put('/auth/change-password', authenticateToken, authController.changePassword);
router.post('/auth/forgot-password', authController.resetPasswordRequest);
router.post('/auth/verify-reset', authController.verifyResetAndSetPassword);
router.put('/auth/admin-reset-password', authenticateToken, authController.adminResetPassword);
router.get('/auth/users-for-reset', authenticateToken, authController.getAllUsersForReset);
router.get('/auth/me', authenticateToken, authController.me);

// Dashboard (Fully Intact)
router.get('/dashboard', authenticateToken, dashboardController.getDashboard);

// Students (Fully Intact)
router.get('/students', authenticateToken, studentController.getAllStudents);
router.get('/students/:id', authenticateToken, studentController.getStudentById);
router.post('/students', authenticateToken, studentController.addStudent);
router.put('/students/:id', authenticateToken, studentController.updateStudent);

// Attendance (Fully Intact)
router.get('/attendance', authenticateToken, attendanceController.getAttendance);
router.post('/attendance', authenticateToken, attendanceController.saveAttendance);
router.get('/attendance/report', authenticateToken, attendanceController.getAttendanceReport);
router.get('/attendance/daily-report', authenticateToken, attendanceController.getDailyReport);

// Fee (Fully Intact)
router.get('/fees', authenticateToken, feeController.getFeePayments);
router.get('/fees/all-students-status', authenticateToken, feeController.getAllStudentsWithFeeStatus);
router.get('/fees/dashboard-stats', authenticateToken, feeController.getDashboardFeeStats);
router.post('/fees', authenticateToken, feeController.createFeePayment);
router.get('/fees/receipt/:id', authenticateToken, feeController.getReceiptById);

// Salary (Fully Intact)
router.get('/salary', authenticateToken, salaryController.getSalarySlips);
router.get('/salary/all-employees-status', authenticateToken, salaryController.getAllEmployeesWithSalaryStatus);
router.get('/salary/dashboard-stats', authenticateToken, salaryController.getDashboardSalaryStats);
router.post('/salary', authenticateToken, salaryController.generateSalarySlip);
router.put('/salary/:id/paid', authenticateToken, salaryController.updateSalaryStatus);
router.get('/salary/:id', authenticateToken, salaryController.getSalarySlipById);

// Employees (Fully Intact)
router.get('/employees', authenticateToken, employeeController.getAllEmployees);
router.get('/employees/:id', authenticateToken, employeeController.getEmployeeById);
router.post('/employees', authenticateToken, employeeController.addEmployee);
router.put('/employees/:id', authenticateToken, employeeController.updateEmployee);
router.put('/employees/:id/toggle-status', authenticateToken, employeeController.toggleEmployeeStatus);

// Config Core Endpoints (Fully Intact)
router.get('/config/classes', authenticateToken, configController.getClasses);
router.post('/config/classes', authenticateToken, requireRole('admin'), configController.addClass);
router.put('/config/classes/:id', authenticateToken, requireRole('admin'), configController.updateClass);
router.delete('/config/classes/:id', authenticateToken, requireRole('admin'), configController.deleteClass);

router.get('/config/fee-types', authenticateToken, configController.getFeeTypes);
router.post('/config/fee-types', authenticateToken, requireRole('admin'), configController.addFeeType);
router.put('/config/fee-types/:id', authenticateToken, requireRole('admin'), configController.updateFeeType);
router.delete('/config/fee-types/:id', authenticateToken, requireRole('admin'), configController.deleteFeeType);

router.get('/config/roles', authenticateToken, configController.getRoles);
router.post('/config/roles', authenticateToken, requireRole('admin'), configController.addRole);
router.put('/config/roles/:id', authenticateToken, requireRole('admin'), configController.updateRole);
router.delete('/config/roles/:id', authenticateToken, requireRole('admin'), configController.deleteRole);

// ─── SAFE UPDATED ROUTING REGISTRIES FOR COMPREHENSIVE CONTROL ───
router.get('/config/exam-settings', authenticateToken, configController.getExamSettings);
router.post('/config/exam-settings', authenticateToken, requireRole('admin'), configController.saveExamSettings);
router.delete('/config/exam-settings/:id', authenticateToken, requireRole('admin'), configController.deleteExamSetting);

// Subjects & Class-wise maps (Fully Intact)
router.get('/subjects', authenticateToken, marksController.getSubjects);
router.post('/subjects', authenticateToken, marksController.addSubject);
router.put('/subjects/:id', authenticateToken, marksController.updateSubject);
router.delete('/subjects/:id', authenticateToken, marksController.deleteSubject);

router.get('/exam-types', authenticateToken, marksController.getExamTypes);
router.post('/exam-types', authenticateToken, marksController.addExamType);
router.put('/exam-types/:id', authenticateToken, marksController.updateExamType);
router.delete('/exam-types/:id', authenticateToken, marksController.deleteExamType);

router.get('/class-subjects', authenticateToken, marksController.getClassSubjects);
router.post('/class-subjects', authenticateToken, marksController.assignClassSubject);
router.delete('/class-subjects/:id', authenticateToken, marksController.removeClassSubject);

// Marks System Engine Paths
router.get('/marks/remarks', authenticateToken, marksController.getRemarks);
router.post('/marks/remarks', authenticateToken, marksController.saveRemarks);
router.get('/marks/marksheet', authenticateToken, marksController.getMarksheet);
router.get('/marks', authenticateToken, marksController.getMarks);
router.post('/marks', authenticateToken, marksController.saveMarks);

router.get('/teacher-assigned-subjects', authenticateToken, marksController.getTeacherAssignedSubjects);
router.post('/teacher-assigned-subjects', authenticateToken, marksController.saveTeacherAssignedSubjects);

// Broadcasts (Fully Intact)
router.get('/broadcasts', authenticateToken, broadcastController.getBroadcasts);
router.post('/broadcasts', authenticateToken, broadcastController.sendBroadcast);
router.post('/broadcasts/whatsapp', authenticateToken, broadcastController.sendWhatsAppBroadcast);
router.delete('/broadcasts/:id', authenticateToken, broadcastController.deleteBroadcast);

module.exports = router;