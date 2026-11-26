import os
import json


class Agent:
    def __init__(self):
        # Configurar las herramientas
        self.setup_tools()

        # Historial de mensajes (memoria)
        self.messages = [
            {
                "role": "system",
                "content": "Eres un asistente útil que habla español y eres muy conciso con tus respuestas.",
            }
        ]

    def setup_tools(self):
        # Lista de herramientas que el modelo puede usar
        self.tools = [
            # Herramienta para listar archivos
            {
                "type": "function",
                "name": "list_files_in_dir",
                "description": "Lista los archivos que existen en un directorio dado (por defecto es el directorio actual).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "directory": {
                            "type": "string",
                            "description": "Directorio para listar (opcional). Por defecto es el directorio actual.",
                        }
                    },
                    "required": [],
                },
            },
            # Herramienta para leer archivos
            {
                "type": "function",
                "name": "read_file",
                "description": "Lee el contenido de un archivo en una ruta especificada.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "La ruta del archivo a leer.",
                        }
                    },
                    "required": ["path"],
                },
            },
            # Herramienta para crear o editar archivos
            {
                "type": "function",
                "name": "edit_file",
                "description": "Edita el contenido de un archivo reemplazando prev_text por new_text. Crea el archivo si no existe.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "La ruta del archivo a editar o crear.",
                        },
                        "prev_text": {
                            "type": "string",
                            "description": "El texto que se va a reemplazar (puede ser vacío para archivos nuevos).",
                        },
                        "new_text": {
                            "type": "string",
                            "description": "El texto nuevo que reemplazará a prev_text.",
                        },
                    },
                    "required": ["path", "new_text"],
                },
            },
        ]

    # Listar archivos de un directorio
    def list_files_in_dir(self, directory="."):
        print("  ⚙️ Herramienta llamada: list_files_in_dir")
        try:
            files = os.listdir(directory)
            return {"files": files}
        except Exception as e:
            return {"error": str(e)}

    # Leer un archivo
    def read_file(self, path):
        print("  ⚙️ Herramienta llamada: read_file")
        try:
            with open(path, encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            return f"Error al leer el archivo {path}: {e}"

    # Crear o editar un archivo
    def edit_file(self, path, prev_text="", new_text=""):
        print("  ⚙️ Herramienta llamada: edit_file")
        try:
            existed = os.path.exists(path)

            # Si existe y hay texto anterior, se reemplaza
            if existed and prev_text:
                content = self.read_file(path)
                if prev_text not in content:
                    return f"Texto '{prev_text}' no encontrado en el archivo"
                content = content.replace(prev_text, new_text)

            # Si no, se crea el archivo nuevo
            else:
                dir_name = os.path.dirname(path)
                if dir_name:
                    os.makedirs(dir_name, exist_ok=True)
                content = new_text

            # Guardar el archivo
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)

            action = "editado" if existed and prev_text else "creado"
            return f"Archivo {path} {action} exitosamente"
        except Exception as e:
            return f"Error al crear o editar el archivo {path}: {e}"

    # Procesar la respuesta del modelo
    def process_response(self, response):
        called_tool = False

        for output in response.output:
            # El modelo quiere llamar una herramienta
            if output.type == "function_call":
                fn_name = output.name
                args = json.loads(output.arguments or "{}")
                print(f"  🛠️ El modelo quiere usar {fn_name} con {args}")

                # Guardar el llamado en el historial
                self.messages.append(
                    {
                        "type": "function_call",
                        "call_id": output.call_id,
                        "name": fn_name,
                        "arguments": output.arguments,
                    }
                )

                # Llamar la herramienta correspondiente
                if fn_name == "list_files_in_dir":
                    result = self.list_files_in_dir(**args)
                elif fn_name == "read_file":
                    result = self.read_file(**args)
                elif fn_name == "edit_file":
                    result = self.edit_file(**args)
                else:
                    result = {"error": f"Herramienta desconocida: {fn_name}"}

                # Darle el resultado al modelo
                self.messages.append(
                    {
                        "type": "function_call_output",
                        "call_id": output.call_id,
                        "output": json.dumps({"result": result}, ensure_ascii=False),
                    }
                )
                called_tool = True

            # El modelo respondió con un mensaje
            elif output.type == "message":
                text = "\n".join(part.text for part in output.content if getattr(part, "text", None))
                self.messages.append({"role": "assistant", "content": text})
                print(f"Asistente: {text}")

        return called_tool