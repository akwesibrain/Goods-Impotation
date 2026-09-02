# Supabase Authentication Setup & Testing Guide

## ✅ Test Credentials
- **Email**: amponsahbrain2007@gmail.com
- **Password**: Brain@0536..!!

## 🔧 Setup Steps in Supabase Dashboard

### 1. Enable Email Authentication
1. Go to **Authentication > Providers**
2. Ensure **Email** is enabled
3. Toggle **"Enable email confirmations"** (or disable if you want instant signup)
4. Save

### 2. Create Test User (Admin)
1. Go to **Authentication > Users**
2. Click **"Add user"**
3. Email: `amponsahbrain2007@gmail.com`
4. Password: `Brain@0536..!!`
5. Check **"Auto Confirm User"** ✅
6. Create User

### 3. Mark User as Staff
After user is created, go to **SQL Editor** and run:
```sql
UPDATE public.profiles 
SET is_staff = true, staff_role = 'owner'
WHERE id = (SELECT id FROM auth.users WHERE email = 'amponsahbrain2007@gmail.com');
```

### 4. Configure Email Templates (Optional)
If using email confirmations, customize templates in:
- **Authentication > Email Templates**

### 5. Enable Signup (if not already enabled)
- **Authentication > Providers > Email**
- Ensure "Disable sign ups" is **OFF**

## 🧪 Testing Checklist

### Test Sign-Up
1. Go to account.html
2. Click **Sign up** tab
3. Enter:
   - Full name: `Test User`
   - Phone: `0540309637` (Ghana format)
   - Email: `testuser@example.com`
   - Password: `Password123`
4. ✅ Should show: "Account created. Check your email to confirm, then log in."

### Test Sign-In
1. Go to account.html
2. Click **Log in** tab
3. Enter:
   - Email: `amponsahbrain2007@gmail.com`
   - Password: `Brain@0536..!!`
4. ✅ Should sign in and show dashboard

### Test Profile Update
1. After sign-in, go to **Profile** section
2. Update any field
3. ✅ Should save without errors

### Test Orders Fetch
1. After sign-in, go to **My Orders** section
2. ✅ Should load (empty list is OK for new users)

## 🚨 Common Issues & Fixes

### "Email or password is wrong"
- Check credentials are correct
- Ensure user exists in Supabase > Authentication > Users
- Verify user is "Auto Confirmed" if email confirmation is required
- Check browser console (F12) for detailed error

### "Account service is not connected yet"
- Supabase credentials in `supabase-client.js` are wrong
- Check `SUPABASE_URL` and `SUPABASE_ANON_KEY` match your project
- Verify keys in Project Settings > API

### Sign-up fails with "Enter a Ghana phone number"
- Phone must be Ghana format: 0540309637, +233540309637, or 233540309637
- Validation enforces this in `validation.js`

### Profile not saving
- Check user is logged in (session exists)
- Verify Row Level Security (RLS) policies in Supabase
- Check browser console for specific error

## 📊 Monitoring & Debugging

### View Authentication Logs
- **Authentication > User**
- Click on user to see sign-in history

### Check Database Changes
- **SQL Editor**
- Run: `SELECT * FROM auth.users LIMIT 10;`
- Run: `SELECT * FROM public.profiles LIMIT 10;`

### Browser Console Debugging
1. Open DevTools: **F12**
2. Go to **Console** tab
3. Look for error messages from:
   - `signInCustomer()`
   - `signUpCustomer()`
   - `updateMyProfile()`

### Network Tab Debugging
1. Open DevTools: **F12**
2. Go to **Network** tab
3. Filter by: `kajtwabmwbncfgvehqmm.supabase.co`
4. Check response status (should be 200, not 400/401/500)

## 🔐 Security Notes

- The `SUPABASE_ANON_KEY` is public (published in browser) — this is safe
- Row Level Security (RLS) policies protect sensitive data
- Passwords are hashed by Supabase (you never see them)
- Session tokens expire and rotate automatically

## 📝 Schema Overview

### Tables Used by Authentication
- **auth.users** — Managed by Supabase, houses email/password
- **public.profiles** — User details (name, phone, address, etc.)
- **public.requests** — User's import orders (linked by user_id)

### Row Level Security Policies
- Users can only read/update their own profile
- Staff (is_staff=true) can read all profiles and requests
- Anonymous users can insert requests (no login required)

---

**Last Updated**: 2026-09-02
**Status**: ✅ Authentication system fixed and tested
