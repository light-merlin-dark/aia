def fibonacci(n):
    if n <= 1:
        return n
    else:
        return fibonacci(n-1) + fibonacci(n-2)

def main():
    num = 10
    result = fibonacci(num)
    print(f"The {num}th Fibonacci number is: {result}")

if __name__ == "__main__":
    main()