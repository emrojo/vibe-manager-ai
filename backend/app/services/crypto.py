import base64
import hashlib
import logging
from typing import Optional
from cryptography.fernet import Fernet, InvalidToken
from app.config import settings

logger = logging.getLogger("crypto_service")

def _get_fernet() -> Fernet:
    """Derives a deterministic 32-byte urlsafe base64 key from SECRET_KEY."""
    raw_hash = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
    key_b64 = base64.urlsafe_b64encode(raw_hash)
    return Fernet(key_b64)

def encrypt_token(token: Optional[str]) -> Optional[str]:
    """
    Encrypts a sensitive token for storage at rest in the database.
    Prepends 'enc:' prefix so we know it's encrypted.
    """
    if not token or not isinstance(token, str):
        return token
    stripped = token.strip()
    if not stripped:
        return ""
    if stripped.startswith("enc:"):
        return stripped

    f = _get_fernet()
    encrypted_bytes = f.encrypt(stripped.encode("utf-8"))
    return "enc:" + encrypted_bytes.decode("ascii")

def decrypt_token(token: Optional[str]) -> Optional[str]:
    """
    Decrypts an encrypted token from the database.
    If the token does not start with 'enc:', returns it as-is for backward compatibility.
    """
    if not token or not isinstance(token, str):
        return token
    stripped = token.strip()
    if not stripped or not stripped.startswith("enc:"):
        return stripped

    payload = stripped[4:]
    try:
        f = _get_fernet()
        decrypted_bytes = f.decrypt(payload.encode("ascii"))
        return decrypted_bytes.decode("utf-8")
    except (InvalidToken, Exception) as e:
        logger.error(f"Fallo al descifrar token sensible: {e}")
        return ""

