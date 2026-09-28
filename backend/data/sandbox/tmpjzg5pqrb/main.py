def caesar_encrypt(message, shift):
    if not isinstance(message, str) or len(message) == 0:
        raise ValueError("Message must be a non-empty string.")
    
    encrypted_message = ""
    for char in message:
        if char.isalpha():
            is_uppercase = char.isupper()
            base = ord('A') if is_uppercase else ord('a')
            shifted_char = chr((ord(char) - base + shift) % 26 + base)
            encrypted_message += shifted_char
        else:
            encrypted_message += char
    
    return encrypted_message

# Example usage
message = "Hello, World!"
shift = 3
encrypted = caesar_encrypt(message, shift)
print(f"Original: {message}")
print(f"Encrypted: {encrypted}")