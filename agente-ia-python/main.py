import os
from openai import OpenAI
from dotenv import load_dotenv
from agent import Agent

# Cargar la llave del archivo .env
load_dotenv()

# Crear el cliente (usando Groq, que es gratis)
client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1",
)

# Modelo a utilizar
MODELO = "openai/gpt-oss-20b"

# Crear el agente
agent = Agent()

# Bucle del chatbot
while True:
    # Pedir texto al usuario
    user_input = input("Tú: ").strip()

    # Si no escribió nada, volver a pedir
    if not user_input:
        continue

    # Si quiere salir, terminar el programa
    if user_input.lower() in ("salir", "exit", "bye", "sayonara"):
        print("¡Hasta luego!")
        break

    # Agregar el mensaje del usuario al historial
    agent.messages.append({"role": "user", "content": user_input})

    # Llamar al modelo hasta que ya no use herramientas
    while True:
        response = client.responses.create(
            model=MODELO,
            input=agent.messages,
            tools=agent.tools,
        )

        # Procesar la respuesta
        called_tool = agent.process_response(response)

        # Si no llamó herramientas, salir
        if not called_tool:
            break