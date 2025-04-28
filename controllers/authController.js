// Controller untuk autentikasi dan manajemen user (login, logout, ganti password)
import User from "../models/user.js";

// Render halaman login (redirect ke dashboard jika sudah login)
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

// Proses autentikasi user saat login
export async function handleLogin(req, res) {
  try {
    // Ambil username dan password dari body request
    const { username, password } = req.body;

    // Validasi input
    if (!username || !password) {
      return res.redirect("/login?error=Username+dan+password+harus+diisi");
    }

    // Cari user di database
    const user = await User.findOne({ where: { username } });

    // Validasi user dan password
    if (!user || !(await user.comparePassword(password))) {
      return res.redirect("/login?error=Username+atau+password+salah");
    }

    // Simpan user ID di session
    req.session.userId = user.id;

    // Redirect ke halaman yang diminta sebelumnya atau ke dashboard
    const returnTo = req.session.returnTo || "/";
    delete req.session.returnTo;

    res.redirect(returnTo);
  } catch (error) {
    // Handling error login
    console.error("Login error:", error);
    res.redirect("/login?error=Gagal+login.+Silakan+coba+lagi");
  }
}

// Proses logout user
export function handleLogout(req, res) {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
    }
    res.redirect("/login");
  });
}

// Membuat user admin default jika belum ada user di database
export async function createInitialUser() {
  try {
    // Cek jumlah user yang ada di database
    const userCount = await User.count();

    // Jika belum ada user, buat user admin default
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

// Render halaman ganti password
export function renderChangePasswordPage(req, res) {
  res.render("auth/change-password", {
    title: "Change Password",
    page: "change-password",
    success: req.query.success,
    error: req.query.error,
  });
}

// Proses ganti password user
export async function handleChangePassword(req, res) {
  try {
    // Ambil data password dari body request
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validasi input
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.redirect("/change-password?error=All+fields+are+required");
    }

    // Validasi kecocokan password baru dan konfirmasi
    if (newPassword !== confirmPassword) {
      return res.redirect("/change-password?error=New+passwords+do+not+match");
    }

    // Validasi password baru berbeda dengan password lama
    if (currentPassword === newPassword) {
      return res.redirect(
        "/change-password?error=New+password+must+be+different+from+current+password",
      );
    }

    // Ambil data user dan validasi password lama
    const user = await User.findByPk(req.user.id);
    const isPasswordValid = await user.comparePassword(currentPassword);

    if (!isPasswordValid) {
      return res.redirect(
        "/change-password?error=Current+password+is+incorrect",
      );
    }

    // Simpan password baru
    user.password = newPassword;
    await user.save();

    // Redirect dengan pesan sukses
    res.redirect("/change-password?success=Password+changed+successfully");
  } catch (error) {
    // Handling error ganti password
    console.error("Change password error:", error);
    res.redirect("/change-password?error=Failed+to+change+password");
  }
}
