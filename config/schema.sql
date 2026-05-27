CREATE DATABASE IF NOT EXISTS school_management;
USE school_management;

-- Classes Table
CREATE TABLE IF NOT EXISTS classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fee Types Table
CREATE TABLE IF NOT EXISTS fee_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  amount DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Roles Table
CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  access JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users Table (Admin, Principal, Employee)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  emp_id VARCHAR(20) UNIQUE,
  full_name VARCHAR(200) NOT NULL,
  role_id INT,
  login_user_id VARCHAR(100) UNIQUE NOT NULL,
  login_password VARCHAR(255) NOT NULL,
  phone VARCHAR(15),
  qualification VARCHAR(200),
  subject VARCHAR(200),
  salary DECIMAL(10,2) DEFAULT 0,
  joining_date DATE,
  class_assigned INT,
  is_active TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id),
  FOREIGN KEY (class_assigned) REFERENCES classes(id) ON DELETE SET NULL
);

-- Students Table
CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  roll_no VARCHAR(20) UNIQUE,
  full_name VARCHAR(200) NOT NULL,
  class_id INT,
  phone VARCHAR(15) NOT NULL,
  whatsapp_no VARCHAR(15) NOT NULL,
  email VARCHAR(200) NOT NULL,
  date_of_birth DATE NOT NULL,
  address TEXT NOT NULL,
  fee_status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
);

-- Attendance Table
CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  person_type ENUM('student','employee') NOT NULL,
  person_id INT NOT NULL,
  attendance_date DATE NOT NULL,
  status ENUM('present','absent','late','halfday') NOT NULL,
  marked_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_attendance (person_type, person_id, attendance_date),
  FOREIGN KEY (marked_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Fee Payments Table
CREATE TABLE IF NOT EXISTS fee_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  receipt_no VARCHAR(50) UNIQUE,
  student_id INT NOT NULL,
  fee_type_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_month VARCHAR(7),
  remarks TEXT,
  generated_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (fee_type_id) REFERENCES fee_types(id),
  FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Salary Slips Table
CREATE TABLE IF NOT EXISTS salary_slips (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slip_no VARCHAR(50) UNIQUE,
  employee_id INT NOT NULL,
  month VARCHAR(7) NOT NULL,
  basic_salary DECIMAL(10,2) NOT NULL,
  deductions DECIMAL(10,2) DEFAULT 0,
  net_salary DECIMAL(10,2) NOT NULL,
  status ENUM('generated','paid') DEFAULT 'generated',
  generated_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Insert default roles
INSERT IGNORE INTO roles (name, access) VALUES 
('admin', '["dashboard","students","daily_attendance","attendance_report","fee_payment","salary_slip","employees","principals","reports","configuration"]'),
('principal', '["dashboard","students","daily_attendance","attendance_report","fee_payment","salary_slip","employees","reports"]'),
('employee', '["dashboard","daily_attendance","attendance_report"]');

-- Insert default classes
INSERT IGNORE INTO classes (name) VALUES 
('Class 1'),('Class 2'),('Class 3'),('Class 4'),('Class 5'),
('Class 6'),('Class 7'),('Class 8'),('Class 9'),('Class 10');

-- Insert default fee types
INSERT IGNORE INTO fee_types (name, amount) VALUES 
('Term Fee', 5000),('Exam Fee', 500),('Admission Fee', 10000);

-- Insert default admin user (password: admin123)
INSERT IGNORE INTO users (emp_id, full_name, role_id, login_user_id, login_password, phone) 
VALUES ('EMP001', 'Administrator', 1, 'admin', '$2a$10$rBV2JDeWW3.vKyeQcM5BreZOWYRa/S5P4jYQpM1Y1xr1g8kKs9MVq', '9999999999');
