import User from "../models/user.js";

export function renderLoginPage(req, res) {
  if (req.user) {
    return res.redirect("/");
  }
  res.render("auth/login", {
    title: "Login",
    page: "login",
    error: req.query.error,
  });
}

export async function handleLogin(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.redirect("/login?error=Username+dan+password+harus+diisi");
    }

    const user = await User.findOne({ where: { username } });

    if (!user || !(await user.comparePassword(password))) {
      return res.redirect("/login?error=Username+atau+password+salah");
    }

    req.session.userId = user.id;

    const returnTo = req.session.returnTo || "/";
    delete req.session.returnTo;

    res.redirect(returnTo);
  } catch (error) {
    console.error("Login error:", error);
    res.redirect("/login?error=Gagal+login.+Silakan+coba+lagi");
  }
}

export function handleLogout(req, res) {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
    }
    res.redirect("/login");
  });
}

export async function createInitialUser() {
  try {
    const userCount = await User.count();

    if (userCount === 0) {
      await User.create({
        username: "admin",
        password: "admin",
      });

      console.log("Initial user created");
    }
  } catch (error) {
    console.error("Error creating initial user:", error);
  }
}

export function renderChangePasswordPage(req, res) {
  res.render("auth/change-password", {
    title: "Change Password",
    page: "change-password",
    success: req.query.success,
    error: req.query.error,
  });
}

export async function handleChangePassword(req, res) {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.redirect("/change-password?error=All+fields+are+required");
    }

    if (newPassword !== confirmPassword) {
      return res.redirect("/change-password?error=New+passwords+do+not+match");
    }

    if (currentPassword === newPassword) {
      return res.redirect(
        "/change-password?error=New+password+must+be+different+from+current+password",
      );
    }

    const user = await User.findByPk(req.user.id);
    const isPasswordValid = await user.comparePassword(currentPassword);

    if (!isPasswordValid) {
      return res.redirect(
        "/change-password?error=Current+password+is+incorrect",
      );
    }

    user.password = newPassword;
    await user.save();

    res.redirect("/change-password?success=Password+changed+successfully");
  } catch (error) {
    console.error("Change password error:", error);
    res.redirect("/change-password?error=Failed+to+change+password");
  }
}
