import User from '../models/user.js';

// Render login page
export function renderLoginPage(req, res) {
  if (req.user) {
    return res.redirect('/');
  }
  res.render('auth/login', {
    title: 'Login',
    page: 'login',
    error: req.query.error
  });
}

// Handle login form submission
export async function handleLogin(req, res) {
  try {
    const { username, password } = req.body;
    
    // Validate input
    if (!username || !password) {
      return res.redirect('/login?error=Username+dan+password+harus+diisi');
    }
    
    // Find user by username
    const user = await User.findOne({ where: { username } });
    
    // Check if user exists and password is correct
    if (!user || !(await user.comparePassword(password))) {
      return res.redirect('/login?error=Username+atau+password+salah');
    }
    
    // Set user session
    req.session.userId = user.id;
    
    // Redirect to the page the user was trying to access or to dashboard
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    
    res.redirect(returnTo);
  } catch (error) {
    console.error('Login error:', error);
    res.redirect('/login?error=Gagal+login.+Silakan+coba+lagi');
  }
}

// Handle logout
export function handleLogout(req, res) {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/login');
  });
}

// Create initial user
export async function createInitialUser() {
  try {
    const userCount = await User.count();
    
    // Only create default user if no users exist
    if (userCount === 0) {
      await User.create({
        username: 'admin',
        password: 'admin' // This will be hashed by the model hooks
      });
      
      console.log('Initial user created');
    }
  } catch (error) {
    console.error('Error creating initial user:', error);
  }
}

// Render change password page
export function renderChangePasswordPage(req, res) {
  res.render('auth/change-password', {
    title: 'Change Password',
    page: 'change-password',
    success: req.query.success,
    error: req.query.error
  });
}

// Handle change password form submission
export async function handleChangePassword(req, res) {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    
    // Validate input
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.redirect('/change-password?error=All+fields+are+required');
    }
    
    // Check if new password matches confirmation
    if (newPassword !== confirmPassword) {
      return res.redirect('/change-password?error=New+passwords+do+not+match');
    }
    
    // Check if new password is the same as current
    if (currentPassword === newPassword) {
      return res.redirect('/change-password?error=New+password+must+be+different+from+current+password');
    }
    
    // Verify current password
    const user = await User.findByPk(req.user.id);
    const isPasswordValid = await user.comparePassword(currentPassword);
    
    if (!isPasswordValid) {
      return res.redirect('/change-password?error=Current+password+is+incorrect');
    }
    
    // Update password
    user.password = newPassword;
    await user.save();
    
    // Redirect with success message
    res.redirect('/change-password?success=Password+changed+successfully');
  } catch (error) {
    console.error('Change password error:', error);
    res.redirect('/change-password?error=Failed+to+change+password');
  }
}
