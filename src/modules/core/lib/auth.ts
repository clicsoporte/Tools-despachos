/**
 * @fileoverview Server-side authentication and user management functions.
 * These functions interact directly with the database to handle user data.
 * This file implements secure password handling using bcryptjs.
 * All functions in this file are server-only.
 */
"use server";

import { connectDb, getAllRoles, getCompanySettings, getAllCustomers, getAllProducts, getAllStock, getAllExemptions, getExemptionLaws, getDbModules, getUnreadSuggestions } from './db';
import { sendEmail, getEmailSettings as getEmailSettingsFromDb } from './email-service';
import type { User, ExchangeRateApiResponse, EmailSettings } from '../types';
import bcrypt from 'bcryptjs';
import { logInfo, logWarn, logError } from './logger';
import { headers } from 'next/headers';
import { getExchangeRate, getEmailSettings } from './api-actions';
import { NewUserSchema, UserSchema } from './auth-schemas';

const SALT_ROUNDS = 10;

/**
 * Attempts to log in a user with the given credentials.
 * It securely compares the provided password with the stored hash.
 * @param {string} email - The user's email.
 * @param {string} passwordProvided - The password provided by the user.
 * @returns {Promise<{ user: User | null, forcePasswordChange: boolean }>} The user object and a flag indicating if a password change is required.
 */
export async function login(email: string, passwordProvided: string, clientInfo: { ip: string; host: string; }): Promise<{ user: User | null, forcePasswordChange: boolean }> {
  const db = await connectDb();
  const logMeta = { email, ...clientInfo };
  try {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    const user: User | undefined = stmt.get(email) as User | undefined;

    if (user && user.password) {
      const isMatch = await bcrypt.compare(passwordProvided, user.password);
      if (isMatch) {
        const { password, ...userWithoutPassword } = user;
        await logInfo(`User '${user.name}' logged in successfully.`, logMeta);
        return { user: userWithoutPassword as User, forcePasswordChange: !!user.forcePasswordChange };
      }
    }
    await logWarn(`Failed login attempt for email: ${email}`, logMeta);
    return { user: null, forcePasswordChange: false };
  } catch (error: any) {
    console.error("Login error:", error);
    await logWarn(`Login process failed for email: ${email} with error: ${error.message}`, logMeta);
    return { user: null, forcePasswordChange: false };
  }
}


export async function logout(userId: number): Promise<void> {
    const db = await connectDb();
    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as { name: string } | undefined;
    if (user) {
        await logInfo(`User '${user.name}' logged out.`, { userId });
    }
}

/**
 * Retrieves all users from the database, intended for server-side use where passwords might be needed.
 * This is an internal function and should not be confused with the client-safe `getAllUsers`.
 * @returns {Promise<User[]>} A promise that resolves to an array of all users, including password hashes.
 */
async function getAllUsersWithPasswords(): Promise<User[]> {
    const db = await connectDb();
    try {
        const stmt = db.prepare('SELECT * FROM users ORDER BY name');
        return stmt.all() as User[];
    } catch (error) {
        console.error("Failed to get all users:", error);
        return [];
    }
}

/**
 * Retrieves all users from the database for client-side consumption.
 * Passwords are removed before sending the data.
 * @returns {Promise<User[]>} A promise that resolves to an array of all users without passwords.
 */
export async function getAllUsers(): Promise<User[]> {
    const users = await getAllUsersWithPasswords();
    return users.map(u => {
        const { password, ...userWithoutPassword } = u;
        return userWithoutPassword;
    }) as User[];
}

/**
 * Retrieves all users from the database for reporting purposes.
 * Passwords are removed.
 * @returns {Promise<User[]>} A promise that resolves to an array of all users without passwords.
 */
export async function getAllUsersForReport(): Promise<User[]> {
    const db = await connectDb();
    try {
        const stmt = db.prepare('SELECT * FROM users ORDER BY name');
        const users = stmt.all() as User[];
        // Ensure passwords are never sent to the client.
        return users.map(u => {
            const { password, ...userWithoutPassword } = u;
            return userWithoutPassword;
        }) as User[];
    } catch (error) {
        console.error("Failed to get all users for report:", error);
        return [];
    }
}

/**
 * Adds a new user to the database.
 * @param userData - The data for the new user, including a plaintext password.
 * @returns The newly created user object, without the password hash.
 */
export async function addUser(userData: Omit<User, 'id' | 'avatar' | 'recentActivity' | 'securityQuestion' | 'securityAnswer'> & { password: string, forcePasswordChange: boolean }): Promise<User> {
  const db = await connectDb();

  // Validate data against the schema first
  const validationResult = NewUserSchema.safeParse(userData);
  if (!validationResult.success) {
      throw new Error(`Validation failed: ${validationResult.error.errors.map(e => e.message).join(', ')}`);
  }
  
  const hashedPassword = bcrypt.hashSync(validationResult.data.password, SALT_ROUNDS);

  const highestIdResult = db.prepare('SELECT MAX(id) as maxId FROM users').get() as { maxId: number | null };
  const nextId = (highestIdResult.maxId || 0) + 1;

  const userToCreate: User = {
    id: nextId,
    name: validationResult.data.name,
    email: validationResult.data.email,
    password: hashedPassword,
    role: validationResult.data.role,
    avatar: "",
    recentActivity: "Usuario recién creado.",
    phone: validationResult.data.phone || "",
    whatsapp: validationResult.data.whatsapp || "",
    erpAlias: validationResult.data.erpAlias || "",
    forcePasswordChange: validationResult.data.forcePasswordChange,
  };
  
  const stmt = db.prepare(
    `INSERT INTO users (id, name, email, password, phone, whatsapp, erpAlias, avatar, role, recentActivity, securityQuestion, securityAnswer, forcePasswordChange) 
     VALUES (@id, @name, @email, @password, @phone, @whatsapp, @erpAlias, @avatar, @role, @recentActivity, @securityQuestion, @securityAnswer, @forcePasswordChange)`
  );
  
  stmt.run({
    ...userToCreate,
    phone: userToCreate.phone || null,
    whatsapp: userToCreate.whatsapp || null,
    erpAlias: userToCreate.erpAlias || null,
    securityQuestion: userToCreate.securityQuestion || null,
    securityAnswer: userToCreate.securityAnswer || null,
    forcePasswordChange: userToCreate.forcePasswordChange ? 1 : 0,
  });

  const { password, ...userWithoutPassword } = userToCreate;
  await logInfo(`Admin added a new user: ${userToCreate.name}`, { role: userToCreate.role });
  return userWithoutPassword as User;
}

/**
 * Saves the entire list of users to the database.
 * This is an "all-or-nothing" operation that replaces all existing users.
 * It handles password hashing for new or changed passwords.
 * @param {User[]} users - The full array of users to save.
 * @returns {Promise<void>}
 */
export async function saveAllUsers(users: User[]): Promise<void> {
   const db = await connectDb();
   const upsert = db.prepare(`
    INSERT INTO users (id, name, email, password, phone, whatsapp, erpAlias, avatar, role, recentActivity, securityQuestion, securityAnswer, forcePasswordChange) 
    VALUES (@id, @name, @email, @password, @phone, @whatsapp, @erpAlias, @avatar, @role, @recentActivity, @securityQuestion, @securityAnswer, @forcePasswordChange)
    ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        email = excluded.email,
        password = excluded.password,
        phone = excluded.phone,
        whatsapp = excluded.whatsapp,
        erpAlias = excluded.erpAlias,
        avatar = excluded.avatar,
        role = excluded.role,
        recentActivity = excluded.recentActivity,
        securityQuestion = excluded.securityQuestion,
        securityAnswer = excluded.securityAnswer,
        forcePasswordChange = excluded.forcePasswordChange
   `);

    const transaction = db.transaction((usersToSave: User[]) => {
        const existingUsersMap = new Map<number, { pass: string | undefined; force: boolean | number | undefined }>(
            (db.prepare('SELECT id, password, forcePasswordChange FROM users').all() as User[]).map(u => [u.id, { pass: u.password, force: u.forcePasswordChange }])
        );

        for (const user of usersToSave) {
          // Validate each user object before processing
          const validationResult = UserSchema.safeParse(user);
          if (!validationResult.success) {
              logError(`Skipping user save due to validation error for user ID ${user.id}`, { errors: validationResult.error.flatten() });
              continue; // Skip this invalid user and continue with the next
          }

          const validatedUser = validationResult.data;
          let passwordToSave = validatedUser.password;
          const existingUserData = existingUsersMap.get(validatedUser.id);
          
          if (passwordToSave && passwordToSave !== existingUserData?.pass) {
              if (!passwordToSave.startsWith('$2a$')) { // Basic check if it's not already a hash
                  passwordToSave = bcrypt.hashSync(passwordToSave, SALT_ROUNDS);
              }
          } else {
             passwordToSave = existingUserData?.pass;
          }

          const userToInsert = {
            ...validatedUser,
            password: passwordToSave,
            phone: validatedUser.phone || null,
            whatsapp: validatedUser.whatsapp || null,
            erpAlias: validatedUser.erpAlias || null,
            securityQuestion: validatedUser.securityQuestion || null,
            securityAnswer: validatedUser.securityAnswer || null,
            forcePasswordChange: validatedUser.forcePasswordChange ? 1 : 0,
          };
          upsert.run(userToInsert);
        }
    });

    try {
        transaction(users);
        await logInfo(`${users.length} user records were processed for saving.`);
    } catch (error) {
        console.error("Failed to save all users:", error);
        await logError("Failed to save all users.", { error: (error as Error).message });
        throw new Error("Database transaction failed to save users.");
    }
}

/**
 * Securely compares a plaintext password with a user's stored bcrypt hash.
 * @param {number} userId - The ID of the user whose password should be checked.
 * @param {string} password - The plaintext password to check.
 * @param {object} [clientInfo] - Optional client IP and host for logging.
 * @returns {Promise<boolean>} True if the password matches the hash.
 */
export async function comparePasswords(userId: number, password: string, clientInfo?: { ip: string, host: string }): Promise<boolean> {
    const db = await connectDb();
    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(userId) as User | undefined;

    if (!user || !user.password) {
        return false;
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await logWarn('Password comparison failed during settings update/recovery.', clientInfo);
    }
    return isMatch;
}

/**
 * Fetches all the initial data required for the application's authentication context.
 * This is a server action that aggregates data from various database functions.
 */
export async function getInitialAuthData() {
    // Ensure all databases are initialized on first authenticated load
    const dbModules = await getDbModules();
    for (const dbModule of dbModules) {
        await connectDb(dbModule.dbFile);
    }
    
    const [
        roles,
        companySettings,
        customers,
        products,
        stock,
        exemptions,
        exemptionLaws,
        exchangeRate,
        unreadSuggestions
    ] = await Promise.all([
        getAllRoles(),
        getCompanySettings(),
        getAllCustomers(),
        getAllProducts(),
        getAllStock(),
        getAllExemptions(),
        getExemptionLaws(),
        getExchangeRate(),
        getUnreadSuggestions()
    ]);
    
    let rateData: { rate: number | null; date: string | null } = { rate: null, date: null };
    const exchangeRateResponse = exchangeRate as ExchangeRateApiResponse;
    if (exchangeRateResponse?.venta?.valor) {
        rateData.rate = exchangeRateResponse.venta.valor;
        rateData.date = new Date(exchangeRateResponse.venta.fecha).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    }

    return {
        roles,
        companySettings,
        customers,
        products,
        stock,
        exemptions,
        exemptionLaws,
        exchangeRate: rateData,
        unreadSuggestions
    };
}


/**
 * Handles the password recovery process.
 * Generates a temporary password, updates the user's record, and sends an email.
 * @param email - The email of the user requesting recovery.
 * @param clientInfo - Information about the client making the request.
 */
export async function sendPasswordRecoveryEmail(email: string, clientInfo: { ip: string; host: string; }): Promise<void> {
    const db = await connectDb();
    const logMeta = { email, ...clientInfo };

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;
    if (!user) {
        await logWarn('Password recovery requested for non-existent email.', logMeta);
        // We don't throw an error to prevent email enumeration attacks. The UI will show a generic message.
        return;
    }

    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, SALT_ROUNDS);

    db.prepare('UPDATE users SET password = ?, forcePasswordChange = 1 WHERE id = ?')
      .run(hashedPassword, user.id);

    try {
        const emailSettings = await getEmailSettingsFromDb();
        if (!emailSettings.smtpHost) {
            throw new Error("La configuración de SMTP no está establecida. No se puede enviar el correo.");
        }
        
        const emailBody = (emailSettings.recoveryEmailBody || '')
            .replace('[NOMBRE_USUARIO]', user.name)
            .replace('[CLAVE_TEMPORAL]', tempPassword);
            
        await sendEmail({
            to: user.email,
            subject: emailSettings.recoveryEmailSubject || 'Recuperación de Contraseña',
            html: emailBody
        });

        await logInfo(`Password recovery email sent successfully to ${user.name}.`, logMeta);
    } catch (error: any) {
        await logError('Failed to send password recovery email.', { ...logMeta, error: error.message });
        throw new Error("No se pudo enviar el correo de recuperación. Revisa la configuración de SMTP.");
    }
}