# OIDC Auth Server

Secure identity and access management for your applications, based on OpenID Connect.

## Overview

This project provides a standalone OIDC-compliant authentication server. It allows users to sign up, manage their applications in a developer console, and use OIDC for authentication.

## Getting Started

To start using the OIDC Auth Server, follow these steps:

1.  **Sign Up**: [Create a user account](/signup.html).
2.  **Developer Console**: After signing up, you will be redirected to the Developer Console.
3.  **Register Your App**: In the console, register your application to obtain a `clientId` and `clientSecret`.
4.  **Authenticate**: Begin the sign-in flow by navigating to `/v1/authenticate?client_id=YOUR_CLIENT_ID`.

## Features

*   **User Management**: Sign up and sign in for users.
*   **OIDC-Based Authentication**: Standard-compliant authentication flow.
*   **Developer Console**: A dedicated console for developers to register and manage their applications.
*   **Dynamic Client Registration**: Generate `clientId` and `clientSecret` for your applications.

---
