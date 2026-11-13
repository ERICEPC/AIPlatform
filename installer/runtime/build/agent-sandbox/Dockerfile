FROM langgenius/dify-agent-local-sandbox@sha256:316279a82ead635306071d2b6a2ee15395daec10e0348f2002c101403d107646
USER root
RUN /usr/local/bin/python -m pip install --no-cache-dir --disable-pip-version-check --timeout 30 --retries 2 python-docx==1.2.0 lxml==6.0.2 typing-extensions==4.15.0
RUN mv /usr/local/bin/uv /usr/local/bin/uv-real && rm /usr/local/bin/pip /usr/local/bin/pip3 /usr/local/bin/pip3.12
COPY uv /usr/local/bin/uv
COPY pip /usr/local/bin/pip
RUN chmod 755 /usr/local/bin/uv /usr/local/bin/pip && ln -sf pip /usr/local/bin/pip3 && ln -sf pip /usr/local/bin/pip3.12
USER dify
