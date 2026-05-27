-- ============================================================
-- SCHOOL MANAGEMENT SYSTEM - MySQL Database Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS school_management;
USE school_management;

-- ============================================================
-- CLASSES TABLE
-- ============================================================
CREATE TABLE classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- FEE TYPES TABLE
-- ============================================================
CREATE TABLE fee_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- ROLES TABLE
-- ============================================================
CREATE TABLE roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  access_dashboard BOOLEAN DEFAULT FALSE,
  access_students BOOLEAN DEFAULT FALSE,
  access_daily_attendance BOOLEAN DEFAULT FALSE,
  access_attendance_report BOOLEAN DEFAULT FALSE,
  access_fee_payment BOOLEAN DEFAULT FALSE,
  access_salary_slip BOOLEAN DEFAULT FALSE,
  access_employees BOOLEAN DEFAULT FALSE,
  access_principals BOOLEAN DEFAULT FALSE,
  access_reports BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- USERS TABLE (Admin, Principal, Employee logins)
-- ============================================================
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_type ENUM('admin','principal','employee') NOT NULL,
  login_user_id VARCHAR(100) NOT NULL UNIQUE,
  login_password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- STUDENTS TABLE
-- ============================================================
CREATE TABLE students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  roll_no VARCHAR(20) NOT NULL UNIQUE,
  full_name VARCHAR(150) NOT NULL,
  class_id INT NOT NULL,
  phone_no VARCHAR(15) NOT NULL,
  whatsapp_no VARCHAR(15) NOT NULL,
  email VARCHAR(150) NOT NULL,
  date_of_birth DATE NOT NULL,
  address TEXT NOT NULL,
  fee_status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(id)
);

-- ============================================================
-- EMPLOYEES TABLE
-- ============================================================
CREATE TABLE employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  emp_id VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  role_id INT NOT NULL,
  user_id INT,
  class_assigned INT,
  phone_no VARCHAR(15) NOT NULL,
  qualification VARCHAR(200) NOT NULL,
  subject VARCHAR(100),
  salary DECIMAL(10,2) NOT NULL,
  joining_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (class_assigned) REFERENCES classes(id)
);

-- ============================================================
-- PRINCIPALS TABLE
-- ============================================================
CREATE TABLE principals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  emp_id VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  user_id INT,
  phone_no VARCHAR(15) NOT NULL,
  qualification VARCHAR(200) NOT NULL,
  subject VARCHAR(100),
  salary DECIMAL(10,2) NOT NULL,
  joining_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================================
-- STUDENT ATTENDANCE TABLE
-- ============================================================
CREATE TABLE student_attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  attendance_date DATE NOT NULL,
  status ENUM('present','absent','late','halfday') NOT NULL,
  marked_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_student_date (student_id, attendance_date),
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (marked_by) REFERENCES users(id)
);

-- ============================================================
-- EMPLOYEE ATTENDANCE TABLE
-- ============================================================
CREATE TABLE employee_attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  employee_type ENUM('employee','principal') NOT NULL,
  attendance_date DATE NOT NULL,
  status ENUM('present','absent','late','halfday') NOT NULL,
  marked_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_emp_date (employee_id, employee_type, attendance_date),
  FOREIGN KEY (marked_by) REFERENCES users(id)
);

-- ============================================================
-- FEE PAYMENTS TABLE
-- ============================================================
CREATE TABLE fee_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  receipt_no VARCHAR(30) NOT NULL UNIQUE,
  student_id INT NOT NULL,
  fee_type_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_month INT NOT NULL,
  payment_year INT NOT NULL,
  collected_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (fee_type_id) REFERENCES fee_types(id),
  FOREIGN KEY (collected_by) REFERENCES users(id)
);

-- ============================================================
-- SALARY SLIPS TABLE
-- ============================================================
CREATE TABLE salary_slips (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slip_no VARCHAR(30) NOT NULL UNIQUE,
  employee_id INT NOT NULL,
  employee_type ENUM('employee','principal') NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  salary_month INT NOT NULL,
  salary_year INT NOT NULL,
  generated_by INT NOT NULL,
  status ENUM('paid','pending') DEFAULT 'paid',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (generated_by) REFERENCES users(id)
);

-- ============================================================
-- DEFAULT SEED DATA
-- ============================================================

-- Default classes
INSERT INTO classes (name) VALUES 
('Class 1'),('Class 2'),('Class 3'),('Class 4'),('Class 5'),
('Class 6'),('Class 7'),('Class 8'),('Class 9'),('Class 10');

-- Default fee types
INSERT INTO fee_types (name) VALUES 
('Term Fee'),('Exam Fee'),('Admission Fee');

-- Default roles
INSERT INTO roles (name, access_dashboard, access_students, access_daily_attendance, access_attendance_report, access_fee_payment, access_salary_slip, access_employees, access_principals, access_reports)
VALUES 
('Teacher', TRUE, TRUE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE),
('Accountant', TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE),
('Clerk', TRUE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE);

-- Default admin user (password: admin123)
INSERT INTO users (user_type, login_user_id, login_password) 
VALUES ('admin', 'admin', '$2b$10$YourHashedPasswordHere');

-- Note: Run this after seeding to get proper hash:
-- UPDATE users SET login_password = '$2b$10$...' WHERE login_user_id = 'admin';
