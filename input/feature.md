# Feature: User Login

## Description
Users can log in to the application using email and password.
A successful login redirects to the dashboard. A failed login shows an inline error message.

## User Stories
- As a user, I want to log in with valid credentials so I can access my account
- As a user, I want to see an error message when I enter wrong credentials
- As a user, I want my session to persist so I do not have to log in again on the same browser

## Business Rules
- Email must be a valid format (contains @ and a domain)
- Password must be at least 8 characters
- After 5 failed attempts, the account is locked for 15 minutes
- Successful login redirects to /dashboard
- Failed login shows error: "Invalid email or password"
- Session token expires after 24 hours

## API Endpoints

### POST /api/auth/login
Request:
{
  "email": "user@example.com",
  "password": "password123"
}

Response 200:
{
  "token": "jwt-token-here",
  "expiresAt": "2024-01-01T00:00:00Z",
  "user": { "id": "u001", "email": "user@example.com" }
}

Response 401:
{
  "error": "Invalid email or password"
}

Response 423:
{
  "error": "Account locked",
  "unlocksAt": "2024-01-01T00:15:00Z"
}

### GET /api/auth/session
Response 200:
{
  "valid": true,
  "user": { "id": "u001", "email": "user@example.com" }
}

Response 401:
{
  "valid": false
}

## UI Selectors
- Email input:        data-testid="email-input"
- Password input:     data-testid="password-input"
- Login button:       data-testid="login-btn"
- Error message:      data-testid="login-error-msg"
- Dashboard heading:  data-testid="dashboard-heading"
- Lock warning:       data-testid="account-locked-msg"

## Test Data
- Valid user:   email=test@example.com, password=Password123
- Invalid user: email=wrong@example.com, password=wrongpass
- Locked user:  email=locked@example.com (already locked in test environment)