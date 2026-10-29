-- =====================================================================
-- İş paketi 2.6b: hesaba davet ve üst yönetici (owner) — denetim ve değiştirilemezlik
-- =====================================================================

-- Davet: token ve kod özetleri denetim kaydına maskeli yazılır (kararlar #185, #186)
SELECT app_attach_audit('account_invitations', '{id}', '{token_hash,code_hash}');
--> statement-breakpoint

-- Üst yöneticinin mesleki işlem kaydı yalnızca eklenir (karar #196)
SELECT app_attach_immutable('owner_actions');
--> statement-breakpoint

-- Mevcut hesaplar: şifresini en az bir kez kendisi belirlemiş ya da bilinen şifreyle açılmış hesaplar etkin sayılır.
-- Geçici şifresini henüz değiştirmemiş hesaplar ilk şifre değişikliğinde etkinleşir (karar #191).
UPDATE personnel
SET activated_at = coalesce(password_changed_at, created_at)
WHERE activated_at IS NULL AND (password_changed_at IS NOT NULL OR must_change_password = false);
