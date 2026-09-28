from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad

# Define your secret key and initialization vector (IV)
key = b'Sixteen byte key'
iv = b'16byte iv'

def encrypt_text(text):
    # Create an AES cipher object with the specified key and IV
    cipher = AES.new(key, AES.MODE_CBC, iv)
    
    # Pad the text to be a multiple of 16 bytes (AES block size)
    padded_text = pad(text.encode(), AES.block_size)
    
    # Encrypt the padded text
    encrypted_data = cipher.encrypt(padded_text)
    
    return encrypted_data

# Example usage:
original_text = "Hello, World!"
encrypted_data = encrypt_text(original_text)

print("Original Text:", original_text)
print("Encrypted Data:", encrypted_data.hex())