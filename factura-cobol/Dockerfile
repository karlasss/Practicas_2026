FROM ubuntu:24.04

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y gnucobol4 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY factura.cob .
RUN cobc -x -free factura.cob

CMD ["./factura"]
