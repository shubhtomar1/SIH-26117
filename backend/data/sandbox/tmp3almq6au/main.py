# Import necessary libraries
import sys

def add(a, b):
    """
    Add two numbers.
    
    Parameters:
    a (float): The first number.
    b (float): The second number.
    
    Returns:
    float: The sum of a and b.
    """
    return a + b

def subtract(a, b):
    """
    Subtract the second number from the first.
    
    Parameters:
    a (float): The minuend.
    b (float): The subtrahend.
    
    Returns:
    float: The difference between a and b.
    """
    return a - b

def multiply(a, b):
    """
    Multiply two numbers.
    
    Parameters:
    a (float): The first number.
    b (float): The second number.
    
    Returns:
    float: The product of a and b.
    """
    return a * b

def divide(a, b):
    """
    Divide the first number by the second.
    
    Parameters:
    a (float): The dividend.
    b (float): The divisor.
    
    Returns:
    float: The quotient of a divided by b. If b is zero, returns None.
    """
    if b == 0:
        return None
    return a / b

def main():
    # Print welcome message
    print("Welcome to the Simple Calculator!")
    
    while True:
        try:
            # Prompt user for input
            operation = input("Enter an operation (+, -, *, /) or 'exit' to quit: ")
            
            if operation.lower() == 'exit':
                break
            
            num1 = float(input("Enter the first number: "))
            num2 = float(input("Enter the second number: "))
            
            # Perform the selected operation
            if operation == '+':
                result = add(num1, num2)
            elif operation == '-':
                result = subtract(num1, num2)
            elif operation == '*':
                result = multiply(num1, num2)
            elif operation == '/':
                result = divide(num1, num2)
            else:
                print("Invalid operation. Please try again.")
                continue
            
            #